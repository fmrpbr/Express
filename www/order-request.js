(() => {
  const overlay = document.getElementById('order-sheet-overlay');
  const form = document.getElementById('mobile-order-form');
  const panels = [...form.querySelectorAll('[data-order-panel]')];
  const body = form.querySelector('.sheet-body');
  const previous = form.querySelector('[data-order-previous]');
  const next = form.querySelector('[data-order-next]');
  const submit = document.getElementById('btn-submit-order');
  const title = document.getElementById('sheet-title-text');
  const extras = document.getElementById('order-service-options');
  const addressExtras = document.getElementById('order-address-options');
  const narrow = matchMedia('(max-width: 759px)');
  const screen = document.querySelector('.app');
  let step = 0;
  let opener;
  let validateAddress;

  function sync() {
    const staged = narrow.matches;
    panels.forEach((panel, index) => { panel.hidden = staged && index !== step; });
    previous.hidden = !staged || step === 0;
    next.hidden = !staged || step !== 0;
    submit.hidden = (staged && step === 0) || form.dataset.ihubReview === 'true';
  }

  function showStep(index, focus = true) {
    step = index;
    sync();
    body.scrollTop = 0;
    if (focus) panels[index].querySelector('h2').focus({ preventScroll: true });
  }

  function advance() {
    const invalid = [...panels[0].querySelectorAll('input, select, textarea')].find(field =>
      field.willValidate && field.getClientRects().length > 0 && !field.validity.valid
    );
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (validateAddress && !validateAddress()) return;
    showStep(1);
  }

  previous.addEventListener('click', () => showStep(0));
  next.addEventListener('click', advance);
  narrow.addEventListener('change', sync);
  form.addEventListener('keydown', event => {
    if (narrow.matches && step === 0 && event.key === 'Enter' && !event.isComposing && event.target.matches('input:not([type="checkbox"])')) {
      event.preventDefault();
      advance();
    }
  });
  form.addEventListener('invalid', event => {
    const detail = event.target.closest('details');
    if (detail) detail.open = true;
    const index = panels.indexOf(event.target.closest('[data-order-panel]'));
    if (narrow.matches && index >= 0 && panels[index].hidden) showStep(index, false);
  }, true);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.__expressUI.closeSheet();
  });

  window.ExpressOrderRequest = {
    open(checkAddress) {
      opener = document.activeElement;
      validateAddress = checkAddress;
      panels[0].querySelector('h2').textContent = form.dataset.mode === 'quote' ? 'Local do serviço' : 'Cliente e endereço';
      addressExtras.open = Boolean(form.elements.clientReference.value || form.elements.selectedZone.value || form.elements.selectedZone.required);
      extras.open = Boolean(form.elements.notes.value || form.elements.fragile.checked || form.elements.importantNotes.checked || form.elements.bag.checked || form.elements.bank.checked);
      screen.inert = true;
      overlay.classList.add('active');
      showStep(0, false);
      title.focus({ preventScroll: true });
    },
    close() {
      overlay.classList.remove('active');
      screen.inert = false;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    },
  };
})();
