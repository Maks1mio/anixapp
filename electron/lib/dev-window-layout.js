'use strict';

const { screen } = require('electron');

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
// Android-планшет 10": приложение на нём зафиксировано в портрете (android-mobile/AndroidManifest.xml).
const TABLET_WIDTH = 800;
const TABLET_HEIGHT = 1280;
const GAP = 16;
const PC_MIN_WIDTH = 900;
const PC_HEIGHT_SHARE = 0.6;
/** Системный заголовок окна: высота задаётся без него, а на экран он должен помещаться. */
const TITLE_BAR = 65;

/**
 * Окна `npm run dev:all`: слева ПК и под ним ТВ (16:9), правее планшет, справа телефон.
 * На небольшом экране окна частично перекрываются: размеры экранов важнее.
 * У телефона, планшета и ТВ своего заголовка нет, поэтому они с рамкой: иначе их не подвинуть и не закрыть.
 * @returns {import('electron').BrowserWindowConstructorOptions | null}
 */
function devWindowOptions() {
  const target = process.env.ANIXAPP_DEV_WINDOW;
  if (!target) return null;

  const area = screen.getPrimaryDisplay().workArea;
  const mobileX = area.x + area.width - MOBILE_WIDTH - GAP;
  const tabletX = mobileX - TABLET_WIDTH - GAP;
  const pcWidth = Math.max(PC_MIN_WIDTH, tabletX - area.x);
  const pcHeight = Math.round(area.height * PC_HEIGHT_SHARE);
  const tvHeight = area.height - pcHeight - TITLE_BAR;
  const maxContentHeight = area.height - TITLE_BAR;

  const bounds = {
    pc: { x: area.x, y: area.y, width: pcWidth, height: pcHeight },
    tv: {
      x: area.x,
      y: area.y + pcHeight,
      width: Math.min(pcWidth, Math.round((tvHeight * 16) / 9)),
      height: tvHeight,
      useContentSize: true,
    },
    tablet: {
      x: tabletX,
      y: area.y,
      width: TABLET_WIDTH,
      height: Math.min(TABLET_HEIGHT, maxContentHeight),
      useContentSize: true,
    },
    mobile: {
      x: mobileX,
      y: area.y,
      width: MOBILE_WIDTH,
      height: Math.min(MOBILE_HEIGHT, maxContentHeight),
      useContentSize: true,
    },
  }[target];
  if (!bounds) return null;

  // У ПК-версии свой заголовок окна: системная рамка его бы продублировала.
  const frame = target === 'pc' ? {} : { frame: true, titleBarStyle: 'default' };
  return { ...bounds, minWidth: 320, minHeight: 240, ...frame };
}

module.exports = { devWindowOptions };
