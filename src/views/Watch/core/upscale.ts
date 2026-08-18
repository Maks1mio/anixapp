import { GPU_AVAILABLE, startAnime4kUpscale, restoreNativeVideoFrameCallback, type Anime4kSession } from '../../../utils/anime4kUpscale';

const HIDE_CLASS = 'watch-page__video--hidden-for-upscale';

export const gpuAvailable = GPU_AVAILABLE;

export class UpscaleController {
  private session: Anime4kSession | null = null;
  private runId = 0;
  private startLock: Promise<unknown> = Promise.resolve();
  lastError = '';
  inputWidth = 0;
  inputHeight = 0;

  get active(): boolean {
    return this.session != null;
  }

  stop(video?: HTMLVideoElement | null, canvas?: HTMLCanvasElement | null): void {
    this.runId++;
    this.teardown(video, canvas);
  }

  private teardown(video?: HTMLVideoElement | null, canvas?: HTMLCanvasElement | null): void {
    if (this.session) {
      try { this.session.stop(); } catch { /* ignore */ }
      this.session = null;
    }
    this.inputWidth = 0;
    this.inputHeight = 0;
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
      video: HTMLVideoElement | null;
      canvas: HTMLCanvasElement | null;
    },
    myRun: number,
  ): Promise<boolean> {
    const { enabled, mode, aspectRatio = 'auto', video, canvas } = opts;
    this.teardown(video, canvas);
    if (!gpuAvailable || !enabled || !video || !canvas) {
      return false;
    }
    if (video.readyState < 1) {
      return false;
    }

    this.lastError = '';
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      return false;
    }
    video.classList.remove(HIDE_CLASS);
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
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.teardown(video, canvas);
      return false;
    }
  }
}
