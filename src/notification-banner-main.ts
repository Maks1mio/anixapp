import './styles/notification-banner.scss';
import { mountNotificationBanner } from './views/notification-banner';

const app = document.getElementById('app');
if (app) mountNotificationBanner(app);
