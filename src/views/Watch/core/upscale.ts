import {
  GPU_AVAILABLE,
  startAnime4kUpscale,
  restoreNativeVideoFrameCallback,
  computeAnime4kCanvasLayout,
  type Anime4kSession,
  type Anime4kCanvasLayout,
  type Anime4kTargetHeight,
} from '../../../utils/anime4kUpscale';

const HIDE_CLASS = 'watch-page__video--hidden-for-upscale';

export const gpuAvailable = GPU_AVAILABLE;

export class UpscaleController {
  private session: Anime4kSession | null = null;
  private runId = 0;
  private startLock: Promise<unknown> = Promise.resolve();
  lastError = '';
  inputWidth = 0;
  inputHeight = 0;
  bufferWidth = 0;
  bufferHeight = 0;

  get active(): boolean {
    return this.session != null;
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
    const keepCover =
      !!video &&
      (video.classList.contains(HIDE_CLASS) || this.session != null);

    if (!gpuAvailable || !enabled || !video || !canvas) {
      this.teardown(video, canvas, { hard: true });
      return false;
    }
    if (video.readyState < 1) {
      this.teardown(video, canvas, { hard: !keepCover });
      if (keepCover) video.classList.add(HIDE_CLASS);
      return false;
    }

    this.lastError = '';
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      this.teardown(video, canvas, { hard: !keepCover });
      if (keepCover) video.classList.add(HIDE_CLASS);
      return false;
    }

    // Soft restart: остановить GPU, но не показывать сырое видео и не обнулять canvas.
    this.teardown(video, canvas, { hard: false });
    if (keepCover) video.classList.add(HIDE_CLASS);

    try {
      const session = await startAnime4kUpscale({
        video,
        canvas,
        mode,
        container: canvas.parentElement,
        fit: 'contain',
        hideSourceClass: HIDE_CLASS,
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
        if (!keepCover) video.classList.remove(HIDE_CLASS);
        return false;
      }
      this.session = session;
      this.inputWidth = video.videoWidth;
      this.inputHeight = video.videoHeight;
      this.bufferWidth = canvas.width;
      this.bufferHeight = canvas.height;
      video.classList.add(HIDE_CLASS);
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.teardown(video, canvas, { hard: !keepCover });
      if (keepCover) video.classList.add(HIDE_CLASS);
      return false;
    }
  }
}
