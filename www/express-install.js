(() => {
  'use strict';
  const triggers = [...document.querySelectorAll('[data-express-install]')];
  const dialog = document.getElementById('express-install-dialog');
  if (!triggers.length || !dialog || window.Capacitor?.isNativePlatform?.()) return;

  const standalone = matchMedia('(display-mode: standalone)');
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);
  const inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|WhatsApp|; wv\)/i.test(navigator.userAgent);
  const manual = dialog.querySelector('[data-install-manual]');
  const instructions = dialog.querySelector('[data-install-steps]');
  const install = dialog.querySelector('[data-install-pwa]');
  const apk = dialog.querySelector('[data-install-apk]');
  const status = dialog.querySelector('[data-install-status]');
  let promptEvent;
  let installed = false;

  function sync() {
    const available = !installed && !standalone.matches && !navigator.standalone;
    triggers.forEach(button => { button.hidden = !available; });
    install.hidden = !promptEvent;
    manual.hidden = !!promptEvent && !ios;
    apk.hidden = !android;
    dialog.querySelector('[data-install-iphone-guide]').hidden = !ios;
  }

  function showInstructions() {
    const steps = ios ? [
      'Abra o painel do Express no Safari e toque em Compartilhar.',
      'Escolha Adicionar à Tela de Início. Se aparecer Abrir como App Web, mantenha essa opção ativada.',
      'Confirme o nome Express, toque em Adicionar e abra pelo novo ícone.',
    ] : android ? [
      'Abra o painel do Express diretamente no Chrome.',
      'Abra o menu ⋮ e escolha Instalar app ou Adicionar à tela inicial.',
      'Confirme e abra pelo ícone Express.',
    ] : [
      'Abra o painel do Express no Chrome ou Edge.',
      'Use o ícone de instalação na barra de endereços ou a opção Instalar app no menu do navegador.',
      'Confirme e abra pelo atalho Express.',
    ];
    instructions.replaceChildren(...steps.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    dialog.querySelector('[data-install-open-browser]').hidden = !inApp && !ios;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    sync();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    if (dialog.open) dialog.close();
    sync();
  });
  standalone.addEventListener('change', sync);

  function openInstall() {
    status.textContent = '';
    showInstructions();
    sync();
    if (!dialog.open && !triggers[0].hidden) dialog.showModal();
  }
  for (const button of triggers) button.addEventListener('click', openInstall);

  install.addEventListener('click', async () => {
    const event = promptEvent;
    if (!event) return;
    promptEvent = null;
    install.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === 'accepted') {
        installed = true;
        dialog.close();
      }
    } catch {
      status.textContent = 'Use a opção de instalação no menu do navegador.';
    } finally {
      install.disabled = false;
      sync();
    }
  });
  sync();
  if (new URLSearchParams(location.search).get('instalar') === '1') openInstall();
})();
