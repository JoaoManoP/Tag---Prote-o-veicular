'use strict';

const requestForm = document.getElementById('recoveryRequestForm');
const confirmForm = document.getElementById('recoveryConfirmForm');
const requestStatus = document.getElementById('recoveryStatus');
const confirmStatus = document.getElementById('recoveryConfirmStatus');
let challengeId = '';

function showStatus(element, message, success = false) {
  element.textContent = message;
  element.classList.remove('hidden');
  element.classList.toggle('success', success);
}

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/account-security/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('recoveryEmail').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível solicitar o código.');
    showStatus(requestStatus, data.message, true);
    if (data.deliveryAvailable) {
      challengeId = data.challengeId || '';
      confirmForm.classList.remove('hidden');
      if (data.provider === 'mock' && data.developmentCode)
        showStatus(
          requestStatus,
          `${data.message} Provider MOCK: código ${data.developmentCode}.`,
          true
        );
    } else {
      showStatus(
        requestStatus,
        `${data.message} O envio está indisponível até um provider ser configurado.`,
        false
      );
    }
  } catch (error) {
    showStatus(requestStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

confirmForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = confirmForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/account-security/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
        code: document.getElementById('recoveryCode').value,
        newPassword: document.getElementById('recoveryPassword').value
      })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Não foi possível redefinir a senha.');
    }
    showStatus(confirmStatus, 'Senha redefinida. Você já pode entrar novamente.', true);
    setTimeout(() => location.replace('/login.html'), 1200);
  } catch (error) {
    showStatus(confirmStatus, error.message);
    button.disabled = false;
  }
});
