/*
  chiptune3 (worklet version) — vendored + patched for Vite
  Worklet assets live in /public/keygen/player/ (loaded via URL, not imported).
  based on: https://deskjet.github.io/chiptune2.js/
*/

const defaultCfg = {
  repeatCount: -1,
  stereoSeparation: 100,
  interpolationFilter: 0,
  context: false,
  /** Absolute or app-base URL to chiptune3.worklet.js in public/ */
  workletUrl: '',
};

export class ChiptuneJsPlayer {
  constructor(cfg) {
    const { context, workletUrl, ...config } = { ...defaultCfg, ...cfg };
    this.config = config;

    if (context) {
      if (!context.destination) {
        throw new Error('ChiptuneJsPlayer: This is not an audio context');
      }
      this.context = context;
      this.destination = false;
    } else {
      this.context = new AudioContext();
      this.destination = this.context.destination;
    }

    this.gain = this.context.createGain();
    this.gain.gain.value = 1;
    this.handlers = [];

    const moduleUrl =
      workletUrl ||
      new URL(/* @vite-ignore */ './chiptune3.worklet.js', import.meta.url).href;

    this.context.audioWorklet
      .addModule(moduleUrl)
      .then(() => {
        this.processNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        this.processNode.port.onmessage = this.handleMessage_.bind(this);
        this.processNode.port.postMessage({ cmd: 'config', val: this.config });
        this.fireEvent('onInitialized');

        this.processNode.connect(this.gain);
        if (this.destination) this.gain.connect(this.destination);
      })
      .catch((e) => {
        console.error(e);
        this.fireEvent('onError', { type: 'Init', error: e });
      });
  }

  handleMessage_(msg) {
    switch (msg.data.cmd) {
      case 'meta':
        this.meta = msg.data.meta;
        this.duration = msg.data.meta.dur;
        this.fireEvent('onMetadata', this.meta);
        break;
      case 'pos':
        this.currentTime = msg.data.pos;
        this.order = msg.data.order;
        this.pattern = msg.data.pattern;
        this.row = msg.data.row;
        this.fireEvent('onProgress', msg.data);
        break;
      case 'end':
        this.fireEvent('onEnded');
        break;
      case 'err':
        this.fireEvent('onError', { type: msg.data.val });
        break;
      case 'fullAudioData':
        this.fireEvent('onFullAudioData', msg.data);
        break;
      default:
        console.log('Received unknown message', msg.data);
    }
  }

  fireEvent(eventName, response) {
    const handlers = this.handlers;
    if (handlers.length) {
      [...handlers].forEach((handler) => {
        if (handler.eventName === eventName) {
          try {
            handler.handler(response);
          } catch {
            throw new Error('ChiptuneJsPlayer: Error in user handler');
          }
        }
      });
    }
  }

  addHandler(eventName, handler) {
    this.handlers.push({ eventName, handler });
  }

  removeHandler(eventName, handler) {
    this.handlers = this.handlers.filter(
      (h) => h.eventName !== eventName || h.handler !== handler,
    );
  }

  onInitialized(handler) {
    this.addHandler('onInitialized', handler);
  }

  onEnded(handler) {
    this.addHandler('onEnded', handler);
  }

  onError(handler) {
    this.addHandler('onError', handler);
  }

  onMetadata(handler) {
    this.addHandler('onMetadata', handler);
  }

  onProgress(handler) {
    this.addHandler('onProgress', handler);
  }

  onFullAudioData(handler) {
    this.addHandler('onFullAudioData', handler);
  }

  postMsg(cmd, val) {
    if (this.processNode) this.processNode.port.postMessage({ cmd, val });
  }

  load(url) {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('ChiptuneJsPlayer: Could not load from URL');
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => this.play(arrayBuffer))
      .catch((error) => {
        this.fireEvent('onError', { type: 'Load', error });
      });
  }

  play(val) {
    this.postMsg('play', val);
  }

  stop() {
    this.postMsg('stop');
  }

  pause() {
    this.postMsg('pause');
  }

  unpause() {
    this.postMsg('unpause');
  }

  togglePause() {
    this.postMsg('togglePause');
  }

  setRepeatCount(val) {
    this.postMsg('repeatCount', val);
  }

  setCtl(name, val) {
    this.postMsg('setCtl', { name, val });
  }

  setPitch(val) {
    this.postMsg('setCtl', { name: 'play.pitch_factor', val });
  }

  setTempo(val) {
    this.postMsg('setCtl', { name: 'play.tempo_factor', val });
  }

  setStereoSeparation(val) {
    this.postMsg('setStereoSeparation', val * 1);
  }

  setPos(val) {
    this.postMsg('setPos', val);
  }

  setOrderRow(o, r) {
    this.postMsg('setOrderRow', { o, r });
  }

  setVol(val) {
    this.gain.gain.value = val;
  }

  selectSubsong(val) {
    this.postMsg('selectSubsong', val);
  }

  seek(val) {
    this.setPos(val);
  }

  getCurrentTime() {
    return this.currentTime;
  }

  decodeAll(ab) {
    this.postMsg('decodeAll', ab);
  }
}
