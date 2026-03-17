import { renderTitleBar } from '../components/titlebar';
import { iconSettings } from '../components/icons';
import { openSettingsModal } from '../components/settings-modal';

export function renderLogin(onSuccess: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-auth';
  const titlebar = renderTitleBar();

  // На странице входа не показываем стрелки "назад/вперёд" и поиск,
  // но оставляем доступ к настройкам через отдельную кнопку.
  const navEl = titlebar.querySelector('#titlebar-nav') as HTMLElement | null;
  if (navEl) navEl.remove();
  const searchWrap = titlebar.querySelector('#titlebar-search-wrap') as HTMLElement | null;
  if (searchWrap) searchWrap.remove();
  const menu = titlebar.querySelector('#titlebar-menu') as HTMLElement | null;
  if (menu) {
    menu.innerHTML = `
      <button type="button" class="titlebar__menu-item" id="titlebar-login-settings" aria-label="Настройки">
        ${iconSettings(18)}
      </button>
    `;
    const btn = menu.querySelector('#titlebar-login-settings') as HTMLButtonElement | null;
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSettingsModal(() => {});
      });
    }
  }
  wrap.appendChild(titlebar);

  const authWrap = document.createElement('div');
  authWrap.className = 'view-auth__body';
  authWrap.innerHTML = `
    <div class="auth">
      <h1 class="auth__title">AnixApp</h1>
      <p class="auth__subtitle">Войдите в аккаунт Anixart</p>
      <form class="auth-form" id="auth-form">
        <label class="auth-form__label">
          <span>Логин</span>
          <input type="text" name="login" class="auth-form__input" autocomplete="username" required />
        </label>
        <label class="auth-form__label">
          <span>Пароль</span>
          <input type="password" name="password" class="auth-form__input" autocomplete="current-password" required />
        </label>
        <p class="auth-form__error" id="auth-error" hidden></p>
        <button type="submit" class="btn btn-primary auth-form__submit" id="auth-submit">Войти</button>
      </form>
    </div>
  `;
  wrap.appendChild(authWrap);

  const form = authWrap.querySelector('#auth-form') as HTMLFormElement;
  const errorEl = authWrap.querySelector('#auth-error') as HTMLElement;
  const submitBtn = authWrap.querySelector('#auth-submit') as HTMLButtonElement;

  if (!window.anixApi) {
    errorEl.textContent = 'API доступно только в приложении Electron.';
    errorEl.hidden = false;
    return wrap;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = (form.elements.namedItem('login') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (!login || !password) return;

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Вход…';

    try {
      const result = await window.anixApi.auth.signIn(login, password);
      if (result?.success) {
        onSuccess();
        return;
      }
      const code = result?.code ?? -1;
      if (code === 401) errorEl.textContent = 'Неверный логин или пароль.';
      else if (code === 402) errorEl.textContent = 'Аккаунт заблокирован.';
      else if (code === 403) errorEl.textContent = 'Аккаунт заблокирован навсегда.';
      else errorEl.textContent = `Ошибка входа (код ${code}).`;
      errorEl.hidden = false;
    } catch (err) {
      errorEl.textContent = `Ошибка: ${String(err)}`;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  });

  return wrap;
}
