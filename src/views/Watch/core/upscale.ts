import {
  startAnime4kUpscale,
  restoreNativeVideoFrameCallback,
  computeAnime4kCanvasLayout,
  type Anime4kSession,
  type Anime4kCanvasLayout,
  type Anime4kTargetHeight,
} from '../../../utils/anime4kUpscale';
import { isGpuAvailable, probeWebGpuAvailable } from '../../../utils/webgpu-availability.svelte';

export { isGpuAvailable };

const HIDE_CLASS = 'watch-page__video--hidden-for-upscale';

export class UpscaleController {
  private session: Anime4kSession | null = null;
  private runId = 0;
  private startLock: Promise<unknown> = Promise.resolve();
  lastError = '';
  inputWidth = 0;
  inputHeight = 0;
  bufferWidth = 0;
  bufferHeight = 0;
  private appliedMode = -1;
  private appliedTargetHeight: Anime4kTargetHeight = null;
  private appliedAspect = '';

  get active(): boolean {
    return this.session != null;
  }

  /** Тот же вход + mode/target/aspect[/буфер] — можно не пересобирать WebGPU. */
  matchesConfig(
    inputW: number,
    inputH: number,
    mode: number,
    targetHeight: Anime4kTargetHeight,
    aspectRatio: string,
    bufferW?: number,
    bufferH?: number,
  ): boolean {
    if (!this.session) return false;
    const th = targetHeight ?? null;
    if (
      this.inputWidth !== inputW
      || this.inputHeight !== inputH
      || this.appliedMode !== mode
      || (this.appliedTargetHeight ?? null) !== th
      || this.appliedAspect !== aspectRatio
    ) {
      return false;
    }
    if (bufferW != null && this.bufferWidth !== bufferW) return false;
    if (bufferH != null && this.bufferHeight !== bufferH) return false;
    return true;
  }

  stop(video?: HTMLVideoElement | null, canvas?: HTMLCanvasElement | null): void {
    this.runId++;
    this.teardown(video, canvas, { hard: true });
  }

  /** Только CSS-fit без пересборки WebGPU (буфер не меняется). */
  applyCssLayout(
    layout: Anime4kCanvasLayout,
    canvas: HTMLCanvasElement | null,
    aspectRatio = 'auto',
  ): void {
    if (!canvas) return;
    if (aspectRatio !== 'auto') {
      canvas.style.width = '';
      canvas.style.height = '';
      return;
    }
    canvas.style.width = `${layout.cssW}px`;
    canvas.style.height = `${layout.cssH}px`;
  }

  desiredLayout(opts: {
    video: HTMLVideoElement | null;
    canvas: HTMLCanvasElement | null;
    aspectRatio?: string;
    targetHeight?: Anime4kTargetHeight;
    pixelRatio?: number;
  }): Anime4kCanvasLayout | null {
    const { video, canvas, targetHeight = null, pixelRatio = 1 } = opts;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return null;
    return computeAnime4kCanvasLayout(
      video.videoWidth,
      video.videoHeight,
      canvas?.parentElement ?? null,
      'contain',
      pixelRatio,
      targetHeight,
    );
  }

  private teardown(
    video?: HTMLVideoElement | null,
    canvas?: HTMLCanvasElement | null,
    opts?: { hard?: boolean },
  ): void {
    const hard = opts?.hard !== false;
    if (this.session) {
      try {
        this.session.stop(hard ? undefined : { detachOutput: false });
      } catch { /* ignore */ }
      this.session = null;
    }
    this.inputWidth = 0;
    this.inputHeight = 0;
    this.bufferWidth = 0;
    this.bufferHeight = 0;
    this.appliedMode = -1;
    this.appliedTargetHeight = null;
    this.appliedAspect = '';
    if (!hard) return;
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.classList.remove('hero-media__canvas--visible');
    }
    video?.classList.remove(HIDE_CLASS);
    restoreNativeVideoFrameCallback(video);
  }

  async start(opts: {
    enabled: boolean;
    mode: number;
    aspectRatio?: string;
    targetHeight?: Anime4kTargetHeight;
    video: HTMLVideoElement | null;
    canvas: HTMLCanvasElement | null;
  }): Promise<boolean> {
    const myRun = ++this.runId;
    const prev = this.startLock;
    let release: () => void = () => {};
    this.startLock = new Promise<void>((resolve) => { release = resolve; });
    await prev;
    try {
      if (myRun !== this.runId) return false;
      return await this.startNow(opts, myRun);
    } finally {
      release();
    }
  }

  private async startNow(
    opts: {
      enabled: boolean;
      mode: number;
      aspectRatio?: string;
      targetHeight?: Anime4kTargetHeight;
      video: HTMLVideoElement | null;
      canvas: HTMLCanvasElement | null;
    },
    myRun: number,
  ): Promise<boolean> {
    const { enabled, mode, aspectRatio = 'auto', targetHeight = null, video, canvas } = opts;

    if (!(await probeWebGpuAvailable()) || !enabled || !video || !canvas) {
      this.teardown(video, canvas, { hard: true });
      return false;
    }
    // Ждём кадры: иначе WebGPU стартует вхолостую и плеер мигает.
    if (video.readyState < HTMLVideoElement.HAVE_FUTURE_DATA) {
      return false;
    }
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      return false;
    }

    // Уже крутим тот же конфиг (включая размер буфера) — не пересобираем.
    const layout = computeAnime4kCanvasLayout(
      video.videoWidth,
      video.videoHeight,
      canvas.parentElement,
      'contain',
      1,
      targetHeight,
    );
    if (
      this.matchesConfig(
        video.videoWidth,
        video.videoHeight,
        mode,
        targetHeight,
        aspectRatio,
        layout.bufferW,
        layout.bufferH,
      )
    ) {
      this.applyCssLayout(layout, canvas, aspectRatio);
      video.classList.add(HIDE_CLASS);
      return true;
    }

    this.lastError = '';

    // Soft restart: остановить GPU, но видео оставляем видимым до готовности новой сессии.
    this.teardown(video, canvas, { hard: false });
    video.classList.remove(HIDE_CLASS);

    try {
      const session = await startAnime4kUpscale({
        video,
        canvas,
        mode,
        container: canvas.parentElement,
        fit: 'contain',
        // Скрытие video — только после первого кадра (ниже), иначе мигание.
        hideSourceClass: '',
        canvasVisibleClass: '',
        pixelRatio: 1,
        cssLayout: aspectRatio !== 'auto' ? 'ratio' : 'contain',
        targetHeight,
      });
      if (myRun !== this.runId) {
        session?.stop({ detachOutput: false });
        return false;
      }
      if (!session) {
        this.lastError = 'WebGPU недоступен';
        video.classList.remove(HIDE_CLASS);
        return false;
      }
      this.session = session;
      this.inputWidth = video.videoWidth;
      this.inputHeight = video.videoHeight;
      this.bufferWidth = canvas.width;
      this.bufferHeight = canvas.height;
      this.appliedMode = mode;
      this.appliedTargetHeight = targetHeight ?? null;
      this.appliedAspect = aspectRatio;
      // Прогрев: один кадр пайплайна, но video ещё видимо —
      // page включит canvas (upscaleCanvasOn) и только потом скроет video.
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        try {
          video.requestVideoFrameCallback(() => finish());
        } catch {
          /* no RVFC */
        }
        requestAnimationFrame(() => requestAnimationFrame(() => finish()));
        setTimeout(finish, 80);
      });
      if (myRun !== this.runId) {
        session.stop({ detachOutput: false });
        this.session = null;
        return false;
      }
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.teardown(video, canvas, { hard: true });
      return false;
    }
  }
}
