/** Иконки оверлея баннера — lucide, те же что в приложении, плюс VPN-набор. */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  AudioLines,
  BadgeCheck,
  Ban,
  Bell,
  BookOpen,
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Cloud,
  CloudOff,
  Compass,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  Film,
  Flag,
  Flame,
  Folder,
  Globe,
  Heart,
  Home,
  Image,
  Info,
  Key,
  LayoutGrid,
  LayoutList,
  Link,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquareX,
  Mic,
  Newspaper,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat2,
  Reply,
  Rocket,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Shuffle,
  Signal,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Tv,
  Type,
  Unlock,
  User,
  UserPlus,
  Users,
  Volume,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide';

type IconNode = [string, Record<string, string | number | undefined>];

export type VpnBannerIcon = {
  id: string;
  label: string;
  icon: IconNode[];
};

export const VPN_BANNER_ICONS: VpnBannerIcon[] = [
  { id: 'ban', label: 'Ban', icon: Ban },
  { id: 'shield', label: 'Shield', icon: Shield },
  { id: 'shield-check', label: 'Shield check', icon: ShieldCheck },
  { id: 'shield-off', label: 'Shield off', icon: ShieldOff },
  { id: 'globe', label: 'Globe', icon: Globe },
  { id: 'wifi', label: 'Wifi', icon: Wifi },
  { id: 'wifi-off', label: 'Wifi off', icon: WifiOff },
  { id: 'signal', label: 'Signal', icon: Signal },
  { id: 'lock', label: 'Lock', icon: Lock },
  { id: 'unlock', label: 'Unlock', icon: Unlock },
  { id: 'key', label: 'Key', icon: Key },
  { id: 'zap', label: 'Zap', icon: Zap },
  { id: 'badge-check', label: 'Badge check', icon: BadgeCheck },
  { id: 'circle-check', label: 'Circle check', icon: CircleCheck },
  { id: 'circle-alert', label: 'Circle alert', icon: CircleAlert },
  { id: 'circle-x', label: 'Circle x', icon: CircleX },
  { id: 'triangle-alert', label: 'Alert', icon: TriangleAlert },
  { id: 'info', label: 'Info', icon: Info },
  { id: 'sparkles', label: 'Sparkles', icon: Sparkles },
  { id: 'star', label: 'Star', icon: Star },
  { id: 'heart', label: 'Heart', icon: Heart },
  { id: 'check', label: 'Check', icon: Check },
  { id: 'x', label: 'X', icon: X },
  { id: 'play', label: 'Play', icon: Play },
  { id: 'pause', label: 'Pause', icon: Pause },
  { id: 'eye', label: 'Eye', icon: Eye },
  { id: 'eye-off', label: 'Eye off', icon: EyeOff },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'cloud', label: 'Cloud', icon: Cloud },
  { id: 'cloud-off', label: 'Cloud off', icon: CloudOff },
  { id: 'server', label: 'Server', icon: Server },
  { id: 'link', label: 'Link', icon: Link },
  { id: 'megaphone', label: 'Megaphone', icon: Megaphone },
  { id: 'rocket', label: 'Rocket', icon: Rocket },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'download', label: 'Download', icon: Download },
  { id: 'share', label: 'Share', icon: Share2 },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'sliders', label: 'Sliders', icon: SlidersHorizontal },
  { id: 'refresh', label: 'Refresh', icon: RefreshCw },
  { id: 'rotate-ccw', label: 'Rotate ccw', icon: RotateCcw },
  { id: 'rotate-cw', label: 'Rotate cw', icon: RotateCw },
  { id: 'repeat', label: 'Repeat', icon: Repeat2 },
  { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
  { id: 'home', label: 'Home', icon: Home },
  { id: 'compass', label: 'Compass', icon: Compass },
  { id: 'flame', label: 'Flame', icon: Flame },
  { id: 'bell', label: 'Bell', icon: Bell },
  { id: 'bookmark', label: 'Bookmark', icon: Bookmark },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'newspaper', label: 'Newspaper', icon: Newspaper },
  { id: 'book', label: 'Book', icon: BookOpen },
  { id: 'tags', label: 'Tags', icon: Tags },
  { id: 'flag', label: 'Flag', icon: Flag },
  { id: 'pin', label: 'Pin', icon: Pin },
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'copy', label: 'Copy', icon: Copy },
  { id: 'clipboard', label: 'Clipboard', icon: ClipboardList },
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'film', label: 'Film', icon: Film },
  { id: 'file-video', label: 'File video', icon: FileVideo },
  { id: 'mic', label: 'Mic', icon: Mic },
  { id: 'volume', label: 'Volume', icon: Volume },
  { id: 'volume-2', label: 'Volume 2', icon: Volume2 },
  { id: 'volume-x', label: 'Volume off', icon: VolumeX },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'thumbs-up', label: 'Thumbs up', icon: ThumbsUp },
  { id: 'thumbs-down', label: 'Thumbs down', icon: ThumbsDown },
  { id: 'message', label: 'Message', icon: MessageCircle },
  { id: 'message-x', label: 'Message x', icon: MessageSquareX },
  { id: 'reply', label: 'Reply', icon: Reply },
  { id: 'user', label: 'User', icon: User },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'user-plus', label: 'User plus', icon: UserPlus },
  { id: 'log-out', label: 'Log out', icon: LogOut },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'plus', label: 'Plus', icon: Plus },
  { id: 'type', label: 'Type', icon: Type },
  { id: 'layout-grid', label: 'Grid', icon: LayoutGrid },
  { id: 'layout-list', label: 'List', icon: LayoutList },
  { id: 'scan-search', label: 'Scan search', icon: ScanSearch },
  { id: 'chevron-up', label: 'Chevron up', icon: ChevronUp },
  { id: 'chevron-down', label: 'Chevron down', icon: ChevronDown },
  { id: 'chevron-left', label: 'Chevron left', icon: ChevronLeft },
  { id: 'chevron-right', label: 'Chevron right', icon: ChevronRight },
  { id: 'arrow-up', label: 'Arrow up', icon: ArrowUp },
  { id: 'arrow-left', label: 'Arrow left', icon: ArrowLeft },
  { id: 'arrow-right', label: 'Arrow right', icon: ArrowRight },
  { id: 'arrow-up-down', label: 'Arrow up down', icon: ArrowUpDown },
];

export const VPN_BANNER_ICON_IDS = new Set(VPN_BANNER_ICONS.map((i) => i.id));

export const VPN_BANNER_DEFAULT_ICON = 'ban';

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function drawLucideNode(
  ctx: CanvasRenderingContext2D,
  tag: string,
  attrs: Record<string, string | number | undefined>,
): void {
  const fill = String(attrs.fill ?? 'none');
  const stroke = String(attrs.stroke ?? 'currentColor');
  const doFill = fill !== 'none';
  const doStroke = stroke !== 'none';

  if (tag === 'path') {
    const d = attrs.d;
    if (typeof d !== 'string' || !d) return;
    const path = new Path2D(d);
    if (doFill) ctx.fill(path);
    if (doStroke) ctx.stroke(path);
    return;
  }

  ctx.beginPath();
  if (tag === 'circle') {
    ctx.arc(num(attrs.cx), num(attrs.cy), num(attrs.r), 0, Math.PI * 2);
  } else if (tag === 'ellipse') {
    ctx.ellipse(num(attrs.cx), num(attrs.cy), num(attrs.rx), num(attrs.ry), 0, 0, Math.PI * 2);
  } else if (tag === 'line') {
    ctx.moveTo(num(attrs.x1), num(attrs.y1));
    ctx.lineTo(num(attrs.x2), num(attrs.y2));
  } else if (tag === 'polyline' || tag === 'polygon') {
    const pts = String(attrs.points ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (pts.length < 4) return;
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (tag === 'polygon') ctx.closePath();
  } else if (tag === 'rect') {
    const x = num(attrs.x);
    const y = num(attrs.y);
    const w = num(attrs.width);
    const h = num(attrs.height);
    const rx = num(attrs.rx);
    const ry = num(attrs.ry, rx);
    if (rx > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, [rx, ry]);
    else ctx.rect(x, y, w, h);
  } else {
    return;
  }
  if (doFill) ctx.fill();
  if (doStroke) ctx.stroke();
}

/** Рисует lucide-иконку в центр (cx, cy). viewBox 24×24. */
export function drawBannerIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  size: number,
): void {
  const found = VPN_BANNER_ICONS.find((i) => i.id === id) ?? VPN_BANNER_ICONS[0];
  const s = Math.max(8, size);
  ctx.save();
  ctx.translate(cx - s / 2, cy - s / 2);
  ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  for (const [tag, attrs] of found.icon) {
    drawLucideNode(ctx, tag, attrs);
  }
  ctx.restore();
}

function toSvg(icon: IconNode[], size: number, stroke = 'currentColor'): string {
  const attrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    `width="${size}"`,
    `height="${size}"`,
    'viewBox="0 0 24 24"',
    'fill="none"',
    `stroke="${stroke}"`,
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
    'aria-hidden="true"',
  ].join(' ');
  const children = icon
    .map(([tag, a]) => {
      const aStr = Object.entries(a)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${String(v)}"`)
        .join(' ');
      return `<${tag} ${aStr}/>`;
    })
    .join('');
  return `<svg ${attrs}>${children}</svg>`;
}

export function bannerIconSvg(id: string, size = 18, color = 'currentColor'): string {
  const found = VPN_BANNER_ICONS.find((i) => i.id === id) ?? VPN_BANNER_ICONS[0];
  return toSvg(found.icon, size, color);
}
