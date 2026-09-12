import alignLeft from '../../../assets/editor_icons/Position/Align vertical left.svg?raw';
import alignCenterH from '../../../assets/editor_icons/Position/Align vertical center.svg?raw';
import alignRight from '../../../assets/editor_icons/Position/Align vertical right.svg?raw';
import alignTop from '../../../assets/editor_icons/Position/Align horizontal top.svg?raw';
import alignMiddle from '../../../assets/editor_icons/Position/Align horizontal center.svg?raw';
import alignBottom from '../../../assets/editor_icons/Position/Align horizontal bottom.svg?raw';
import rotation from '../../../assets/editor_icons/Position/Rotation.svg?raw';
import layoutH from '../../../assets/editor_icons/Auto layout/Horizontal layout.svg?raw';
import layoutV from '../../../assets/editor_icons/Auto layout/Vertical layout.svg?raw';
import layoutFree from '../../../assets/editor_icons/Auto layout/Remove auto layout.svg?raw';
import layoutUse from '../../../assets/editor_icons/Auto layout/Use auto layout.svg?raw';
import resizeFit from '../../../assets/editor_icons/Auto layout/Resize to fit.svg?raw';
import lockAspect from '../../../assets/editor_icons/Auto layout/Lock aspect ratio.svg?raw';
import unlockAspect from '../../../assets/editor_icons/Auto layout/Unlock aspect ratio.svg?raw';
import opacity from '../../../assets/editor_icons/Appearance/Opacity.svg?raw';
import show from '../../../assets/editor_icons/Appearance/Show.svg?raw';
import hide from '../../../assets/editor_icons/Appearance/Hide.svg?raw';
import styleFill from '../../../assets/editor_icons/Style/Style Fill.svg?raw';
import styleText from '../../../assets/editor_icons/Style/Style Text.svg?raw';
import styleEffect from '../../../assets/editor_icons/Style/Style Effect.svg?raw';
import styleGrid from '../../../assets/editor_icons/Style/Style Grid.svg?raw';
import grid from '../../../assets/editor_icons/Grid/Grid.svg?raw';
import textAlignLeft from '../../../assets/editor_icons/Text/text align left.svg?raw';
import textAlignCenter from '../../../assets/editor_icons/Text/text align center.svg?raw';
import textAlignRight from '../../../assets/editor_icons/Text/text align right.svg?raw';
import add from '../../../assets/editor_icons/General/Add.svg?raw';
import remove from '../../../assets/editor_icons/General/Remove.svg?raw';
import close from '../../../assets/editor_icons/General/X.svg?raw';
import unlock from '../../../assets/editor_icons/General/Unlock.svg?raw';
import selectTool from '../../../assets/editor_icons/General/Select item using.svg?raw';
import view from '../../../assets/editor_icons/General/View.svg?raw';

/** Pan / hand — в наборе Figma inspector нет руки, оставляем компактный глиф в том же ключе. */
const hand = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 11.5V7.75C8.5 7.06 9.06 6.5 9.75 6.5C10.44 6.5 11 7.06 11 7.75V11.5M11 11V6.75C11 6.06 11.56 5.5 12.25 5.5C12.94 5.5 13.5 6.06 13.5 6.75V11M13.5 10.5V7.75C13.5 7.06 14.06 6.5 14.75 6.5C15.44 6.5 16 7.06 16 7.75V14.5C16 17.54 13.54 20 10.5 20C8.01 20 6 18.2 6 15.5V12.75C6 12.06 6.56 11.5 7.25 11.5C7.94 11.5 8.5 12.06 8.5 12.75" stroke="#1B1F24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Lock — в наборе есть только Unlock. */
const lock = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 2C7.20435 2 6.44129 2.31607 5.87868 2.87868C5.31607 3.44129 5 4.20435 5 5V7H4.25C3.56 7 3 7.56 3 8.25V11.75C3 12.44 3.56 13 4.25 13H11.75C12.44 13 13 12.44 13 11.75V8.25C13 7.56 12.44 7 11.75 7H11V5C11 4.20435 10.6839 3.44129 10.1213 2.87868C9.55871 2.31607 8.79565 2 8 2ZM6 5C6 4.46957 6.21071 3.96086 6.58579 3.58579C6.96086 3.21071 7.46957 3 8 3C8.53043 3 9.03914 3.21071 9.41421 3.58579C9.78929 3.96086 10 4.46957 10 5V7H6V5ZM4.25 8C4.1837 8 4.12011 8.02634 4.07322 8.07322C4.02634 8.12011 4 8.1837 4 8.25V11.75C4 11.888 4.112 12 4.25 12H11.75C11.8163 12 11.8799 11.9737 11.9268 11.9268C11.9737 11.8799 12 11.8163 12 11.75V8.25C12 8.1837 11.9737 8.12011 11.9268 8.07322C11.8799 8.02634 11.8163 8 11.75 8H4.25Z" fill="#1B1F24"/></svg>`;

export const editorIcons = {
  alignLeft,
  alignCenterH,
  alignRight,
  alignTop,
  alignMiddle,
  alignBottom,
  rotation,
  layoutH,
  layoutV,
  layoutFree,
  layoutUse,
  resizeFit,
  lockAspect,
  unlockAspect,
  opacity,
  show,
  hide,
  styleFill,
  styleText,
  styleEffect,
  styleGrid,
  grid,
  textAlignLeft,
  textAlignCenter,
  textAlignRight,
  add,
  remove,
  close,
  unlock,
  selectTool,
  view,
  hand,
  lock,
};
