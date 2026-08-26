'use strict';

(function communityPlacesModule(global) {
  const API_ROOT = '/api/community';
  const PLACE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~-]{2,199}$/;
  const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
  const PAGE_SIZE = 20;

  const state = {
    enabled: null,
    initialized: false,
    initPromise: null,
    csrfToken: null,
    ui: null,
    place: null,
    reviews: [],
    summary: null,
    pagination: null,
    ownReview: null,
    editingReviewId: null,
    reportReviewId: null,
    reportedReviewIds: new Set(),
    requestSequence: 0,
    busy: false,
    previousFocus: null
  };

  class CommunityRequestError extends Error {
    constructor(message, { status = 0, code = '', data = null } = {}) {
      super(message);
      this.name = 'CommunityRequestError';
      this.status = status;
      this.code = code;
      this.data = data;
    }
  }

  function createElement(
    tagName,
    { className = '', text = '', attributes = {} } = {},
    children = []
  ) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== '') node.textContent = String(text);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    });
    const childList = Array.isArray(children) ? children : [children];
    childList.filter(Boolean).forEach(child => node.append(child));
    return node;
  }

  function createButton(text, className, action, label) {
    const button = createElement('button', {
      className,
      text,
      attributes: { type: 'button', ...(label ? { 'aria-label': label } : {}) }
    });
    if (action) button.addEventListener('click', action);
    return button;
  }

  function whenDomReady() {
    if (document.body) return Promise.resolve();
    return new Promise(resolve =>
      document.addEventListener('DOMContentLoaded', resolve, { once: true })
    );
  }

  function normalizePlace(rawPlace) {
    if (!rawPlace || typeof rawPlace !== 'object')
      throw new TypeError('Informe o local que será avaliado.');
    const placeKey = typeof rawPlace.placeKey === 'string' ? rawPlace.placeKey.trim() : '';
    const name = typeof rawPlace.name === 'string' ? rawPlace.name.trim() : '';
    const address = typeof rawPlace.address === 'string' ? rawPlace.address.trim() : '';
    if (!PLACE_KEY_PATTERN.test(placeKey))
      throw new TypeError('O local precisa de um identificador estável.');
    if (name.length < 2 || name.length > 160) throw new TypeError('O nome do local é inválido.');
    if (address.length > 300) throw new TypeError('O endereço do local é muito longo.');

    const separator = placeKey.indexOf(':');
    const namespace = separator > 0 ? placeKey.slice(0, separator).toLowerCase() : '';
    const provider =
      typeof rawPlace.provider === 'string' && rawPlace.provider.trim()
        ? rawPlace.provider.trim().toLowerCase()
        : namespace || 'google';
    if (!PROVIDER_PATTERN.test(provider)) throw new TypeError('O provedor do local é inválido.');
    if (namespace && namespace !== provider)
      throw new TypeError('O identificador não corresponde ao provedor do local.');

    const hasLatitude =
      rawPlace.latitude !== undefined && rawPlace.latitude !== null && rawPlace.latitude !== '';
    const hasLongitude =
      rawPlace.longitude !== undefined && rawPlace.longitude !== null && rawPlace.longitude !== '';
    if (hasLatitude !== hasLongitude)
      throw new TypeError('Informe as duas coordenadas públicas do local.');
    let latitude = null;
    let longitude = null;
    if (hasLatitude) {
      latitude = Number(rawPlace.latitude);
      longitude = Number(rawPlace.longitude);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        throw new TypeError('As coordenadas públicas do local são inválidas.');
      }
    }
    return { placeKey, provider, name, address, latitude, longitude };
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function requestJson(path, { method = 'GET', body, csrf = false, retryCsrf = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = await getCsrfToken();
    let response;
    try {
      response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
    } catch {
      throw new CommunityRequestError('Não foi possível conectar ao serviço de avaliações.');
    }
    const data = await parseResponse(response);
    if (response.ok) return data;
    if (csrf && retryCsrf && response.status === 403 && data?.code === 'INVALID_CSRF_TOKEN') {
      state.csrfToken = null;
      return requestJson(path, { method, body, csrf, retryCsrf: false });
    }
    throw new CommunityRequestError(
      typeof data?.error === 'string' ? data.error : 'Não foi possível concluir a solicitação.',
      { status: response.status, code: data?.code || '', data }
    );
  }

  async function getCsrfToken() {
    if (state.csrfToken) return state.csrfToken;
    const data = await requestJson('/api/auth/csrf');
    if (!data?.token) throw new CommunityRequestError('Não foi possível validar sua sessão.');
    state.csrfToken = data.token;
    return state.csrfToken;
  }

  function formatDate(value) {
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(date);
    } catch {
      return date.toLocaleDateString('pt-BR');
    }
  }

  function starText(rating) {
    const safeRating = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
    return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}`;
  }

  function setStatus(message = '', type = 'info') {
    if (!state.ui) return;
    state.ui.status.textContent = message;
    state.ui.status.className = `rc-community-status rc-community-status--${type}`;
    state.ui.status.hidden = !message;
    state.ui.status.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    if (!state.ui) return;
    state.ui.dialog.setAttribute('aria-busy', String(state.busy));
    state.ui.form.querySelectorAll('button, input, textarea').forEach(control => {
      control.disabled = state.busy;
    });
    state.ui.reportForm.querySelectorAll('button, select, textarea').forEach(control => {
      control.disabled = state.busy;
    });
    state.ui.closeButton.disabled = state.busy;
    state.ui.loadMoreButton.disabled = state.busy;
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
      dialog.classList.add('rc-dialog-fallback');
    }
  }

  function createRatingFieldset() {
    const fieldset = createElement('fieldset', { className: 'rc-rating-fieldset' });
    fieldset.append(createElement('legend', { text: 'Sua nota' }));
    const choices = createElement('div', {
      className: 'rc-rating-choices',
      attributes: { role: 'radiogroup', 'aria-label': 'Nota do local' }
    });
    for (let rating = 1; rating <= 5; rating += 1) {
      const input = createElement('input', {
        attributes: {
          type: 'radio',
          name: 'rc-community-rating',
          id: `rc-community-rating-${rating}`,
          value: rating,
          required: ''
        }
      });
      const visual = createElement('span', { text: `${rating} ★` });
      const label = createElement(
        'label',
        {
          className: 'rc-rating-option',
          attributes: {
            for: `rc-community-rating-${rating}`,
            title: `${rating} ${rating === 1 ? 'estrela' : 'estrelas'}`
          }
        },
        [input, visual]
      );
      choices.append(label);
    }
    fieldset.append(choices);
    return fieldset;
  }

  function buildMainDialog() {
    const dialog = createElement('dialog', {
      className: 'rc-community-dialog',
      attributes: {
        'aria-labelledby': 'rc-community-title',
        'aria-describedby': 'rc-community-description',
        'data-community-version': '1'
      }
    });
    const shell = createElement('section', { className: 'rc-community-shell' });
    const header = createElement('header', { className: 'rc-community-header' });
    const headerCopy = createElement('div', { className: 'rc-community-header-copy' });
    const eyebrow = createElement('span', {
      className: 'rc-community-eyebrow',
      text: 'COMUNIDADE DO LOCAL'
    });
    const title = createElement('h2', {
      text: 'Avaliações',
      attributes: { id: 'rc-community-title' }
    });
    const address = createElement('p', { attributes: { id: 'rc-community-description' } });
    headerCopy.append(eyebrow, title, address);
    const closeButton = createButton(
      '×',
      'rc-community-close',
      () => {
        if (!state.busy) closeDialog(dialog);
      },
      'Fechar avaliações'
    );
    header.append(headerCopy, closeButton);

    const summary = createElement('section', {
      className: 'rc-community-summary',
      attributes: { 'aria-label': 'Resumo das avaliações' }
    });
    const average = createElement('strong', { className: 'rc-community-average', text: '—' });
    const stars = createElement('span', {
      className: 'rc-community-stars',
      text: '☆☆☆☆☆',
      attributes: { 'aria-label': 'Ainda sem avaliações' }
    });
    const count = createElement('span', {
      className: 'rc-community-count',
      text: 'Nenhuma avaliação'
    });
    const summaryCopy = createElement('div', { className: 'rc-community-summary-copy' }, [
      stars,
      count
    ]);
    summary.append(average, summaryCopy);

    const status = createElement('div', {
      className: 'rc-community-status rc-community-status--info',
      attributes: { 'aria-live': 'polite', hidden: '' }
    });

    const formSection = createElement('section', { className: 'rc-community-compose' });
    const formHeading = createElement('h3', { text: 'Avalie este local' });
    const privacy = createElement('p', {
      className: 'rc-community-privacy',
      text: 'Sua localização não será publicada. Mostramos apenas seu primeiro nome e a inicial do sobrenome.'
    });
    const form = createElement('form', { attributes: { novalidate: '' } });
    const ratingFieldset = createRatingFieldset();
    const commentId = 'rc-community-comment';
    const comment = createElement('textarea', {
      attributes: {
        id: commentId,
        minlength: '3',
        maxlength: '1200',
        rows: '4',
        required: '',
        placeholder: 'Conte como foi sua experiência neste local.'
      }
    });
    const commentLabel = createElement('label', {
      className: 'rc-community-comment-label',
      text: 'Comentário',
      attributes: { for: commentId }
    });
    const characterCount = createElement('span', {
      className: 'rc-community-character-count',
      text: '0 / 1.200',
      attributes: { 'aria-live': 'polite' }
    });
    const formActions = createElement('div', { className: 'rc-community-form-actions' });
    const cancelEditButton = createButton(
      'Cancelar edição',
      'rc-community-button rc-community-button--ghost',
      () => {
        resetForm();
        renderFormState();
      }
    );
    cancelEditButton.hidden = true;
    const submitButton = createElement('button', {
      className: 'rc-community-button rc-community-button--primary',
      text: 'Publicar avaliação',
      attributes: { type: 'submit' }
    });
    formActions.append(cancelEditButton, submitButton);
    form.append(ratingFieldset, commentLabel, comment, characterCount, formActions);
    const ownReviewNotice = createElement('p', {
      className: 'rc-community-own-notice',
      text: 'Você já avaliou este local. Use “Editar” na sua avaliação para atualizá-la.',
      attributes: { hidden: '' }
    });
    formSection.append(formHeading, privacy, form, ownReviewNotice);

    const listSection = createElement('section', {
      className: 'rc-community-reviews-section',
      attributes: { 'aria-labelledby': 'rc-community-list-title' }
    });
    const listHeading = createElement('div', { className: 'rc-community-list-heading' });
    listHeading.append(
      createElement('h3', {
        text: 'O que as pessoas dizem',
        attributes: { id: 'rc-community-list-title' }
      }),
      createElement('span', { text: 'Mais recentes' })
    );
    const list = createElement('div', { className: 'rc-community-list' });
    const loadMoreButton = createButton(
      'Carregar mais',
      'rc-community-button rc-community-button--ghost rc-community-load-more',
      () => {
        void loadReviews({ append: true });
      }
    );
    loadMoreButton.hidden = true;
    listSection.append(listHeading, list, loadMoreButton);

    const content = createElement('div', { className: 'rc-community-content' }, [
      summary,
      status,
      formSection,
      listSection
    ]);
    shell.append(header, content);
    dialog.append(shell);

    comment.addEventListener('input', () => {
      characterCount.textContent = `${comment.value.length.toLocaleString('pt-BR')} / 1.200`;
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void submitReview();
    });
    dialog.addEventListener('cancel', event => {
      if (state.busy) event.preventDefault();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog && !state.busy) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('rc-community-open');
      if (state.previousFocus && typeof state.previousFocus.focus === 'function')
        state.previousFocus.focus();
      state.previousFocus = null;
    });

    return {
      dialog,
      title,
      address,
      closeButton,
      average,
      stars,
      count,
      status,
      formSection,
      formHeading,
      form,
      comment,
      characterCount,
      cancelEditButton,
      submitButton,
      ownReviewNotice,
      list,
      loadMoreButton
    };
  }

  function buildReportDialog() {
    const dialog = createElement('dialog', {
      className: 'rc-report-dialog',
      attributes: {
        'aria-labelledby': 'rc-report-title',
        'aria-describedby': 'rc-report-description'
      }
    });
    const shell = createElement('section', { className: 'rc-report-shell' });
    const title = createElement('h2', {
      text: 'Denunciar avaliação',
      attributes: { id: 'rc-report-title' }
    });
    const description = createElement('p', {
      text: 'A equipe analisará o conteúdo. A denúncia não publica sua localização.',
      attributes: { id: 'rc-report-description' }
    });
    const form = createElement('form');
    const reasonId = 'rc-report-reason';
    const reasonLabel = createElement('label', { text: 'Motivo', attributes: { for: reasonId } });
    const reason = createElement('select', { attributes: { id: reasonId, required: '' } });
    [
      ['', 'Selecione um motivo'],
      ['SPAM', 'Spam ou propaganda'],
      ['ABUSE', 'Ofensa ou assédio'],
      ['FALSE_INFORMATION', 'Informação incorreta'],
      ['OTHER', 'Outro motivo']
    ].forEach(([value, label]) =>
      reason.append(createElement('option', { text: label, attributes: { value } }))
    );
    const detailsId = 'rc-report-details';
    const detailsLabel = createElement('label', {
      text: 'Detalhes (opcional)',
      attributes: { for: detailsId }
    });
    const details = createElement('textarea', {
      attributes: {
        id: detailsId,
        maxlength: '500',
        rows: '3',
        placeholder: 'Explique brevemente o problema.'
      }
    });
    const status = createElement('div', {
      className: 'rc-community-status rc-community-status--error',
      attributes: { role: 'alert', hidden: '' }
    });
    const actions = createElement('div', { className: 'rc-community-form-actions' });
    const cancelButton = createButton(
      'Cancelar',
      'rc-community-button rc-community-button--ghost',
      () => {
        if (!state.busy) closeDialog(dialog);
      }
    );
    const submitButton = createElement('button', {
      className: 'rc-community-button rc-community-button--danger',
      text: 'Enviar denúncia',
      attributes: { type: 'submit' }
    });
    actions.append(cancelButton, submitButton);
    form.append(reasonLabel, reason, detailsLabel, details, status, actions);
    shell.append(title, description, form);
    dialog.append(shell);

    reason.addEventListener('change', () => {
      const other = reason.value === 'OTHER';
      details.required = other;
      detailsLabel.textContent = other ? 'Detalhes' : 'Detalhes (opcional)';
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void submitReport();
    });
    dialog.addEventListener('cancel', event => {
      if (state.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      state.reportReviewId = null;
      form.reset();
      details.required = false;
      detailsLabel.textContent = 'Detalhes (opcional)';
      status.hidden = true;
      status.textContent = '';
    });
    return { dialog, form, reason, details, status, cancelButton, submitButton };
  }

  function ensureUi() {
    if (state.ui) return state.ui;
    const main = buildMainDialog();
    const report = buildReportDialog();
    document.body.append(main.dialog, report.dialog);
    state.ui = { ...main, reportDialog: report.dialog, reportForm: report.form, report };
    return state.ui;
  }

  function resetForm() {
    if (!state.ui) return;
    state.editingReviewId = null;
    state.ui.form.reset();
    state.ui.comment.value = '';
    state.ui.characterCount.textContent = '0 / 1.200';
  }

  function selectRating(rating) {
    if (!state.ui) return;
    const radio = state.ui.form.querySelector(
      `input[name="rc-community-rating"][value="${Number(rating)}"]`
    );
    if (radio) radio.checked = true;
  }

  function renderSummary() {
    if (!state.ui) return;
    const count = Number(state.summary?.count || 0);
    const average = Number(state.summary?.averageRating);
    if (!count || !Number.isFinite(average)) {
      state.ui.average.textContent = '—';
      state.ui.stars.textContent = '☆☆☆☆☆';
      state.ui.stars.setAttribute('aria-label', 'Ainda sem avaliações');
      state.ui.count.textContent = 'Seja a primeira pessoa a avaliar';
      return;
    }
    state.ui.average.textContent = average.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    state.ui.stars.textContent = starText(average);
    state.ui.stars.setAttribute('aria-label', `${average.toLocaleString('pt-BR')} de 5 estrelas`);
    state.ui.count.textContent = `${count.toLocaleString('pt-BR')} ${count === 1 ? 'avaliação' : 'avaliações'}`;
  }

  function renderFormState() {
    if (!state.ui) return;
    const editing = Boolean(state.editingReviewId);
    state.ui.formHeading.textContent = editing ? 'Editar sua avaliação' : 'Avalie este local';
    state.ui.submitButton.textContent = editing ? 'Salvar alteração' : 'Publicar avaliação';
    state.ui.cancelEditButton.hidden = !editing;
    const blockCreation = Boolean(state.ownReview) && !editing;
    state.ui.form.hidden = blockCreation;
    state.ui.ownReviewNotice.hidden = !blockCreation;
  }

  function beginEdit(review) {
    if (!review?.mine || state.busy) return;
    state.editingReviewId = review.id;
    state.ui.comment.value = String(review.comment || '');
    state.ui.characterCount.textContent = `${state.ui.comment.value.length.toLocaleString('pt-BR')} / 1.200`;
    selectRating(review.rating);
    renderFormState();
    const reducedMotion =
      typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.ui.formSection.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
    state.ui.comment.focus({ preventScroll: true });
  }

  function renderReview(review) {
    const article = createElement('article', { className: 'rc-review-card' });
    if (review.mine) article.classList.add('rc-review-card--mine');
    const header = createElement('header');
    const authorCopy = createElement('div');
    const author = createElement('strong', {
      text: review.author?.displayName || 'Usuário Rastreon'
    });
    const mineBadge = review.mine
      ? createElement('span', { className: 'rc-review-mine-badge', text: 'Sua avaliação' })
      : null;
    const rawDate = Number(review.updatedAt || review.createdAt);
    const parsedDate = new Date(rawDate);
    const date = createElement('time', {
      text: formatDate(rawDate),
      attributes: Number.isFinite(parsedDate.getTime())
        ? { datetime: parsedDate.toISOString() }
        : {}
    });
    authorCopy.append(author);
    if (mineBadge) authorCopy.append(mineBadge);
    authorCopy.append(date);
    const rating = createElement('span', {
      className: 'rc-review-stars',
      text: starText(review.rating),
      attributes: { 'aria-label': `${Number(review.rating)} de 5 estrelas` }
    });
    header.append(authorCopy, rating);
    const comment = createElement('p', { className: 'rc-review-comment' });
    comment.textContent = String(review.comment || '');
    const actions = createElement('footer', { className: 'rc-review-actions' });
    if (review.mine) {
      actions.append(
        createButton('Editar', 'rc-review-action', () => beginEdit(review)),
        createButton(
          'Excluir',
          'rc-review-action rc-review-action--danger',
          () => void deleteReview(review)
        )
      );
    } else {
      if (review.author?.contactId && global.RastreonPlatform) {
        actions.append(
          createButton('Solicitar conversa', 'rc-review-action', () =>
            global.RastreonPlatform.requestConversation({
              contactId: review.author.contactId,
              contextType: 'PLACE_REVIEW',
              contextId: review.id
            })
          )
        );
      }
      if (state.reportedReviewIds.has(review.id))
        actions.append(
          createElement('span', { className: 'rc-review-reported', text: 'Denúncia enviada' })
        );
      else
        actions.append(createButton('Denunciar', 'rc-review-action', () => openReport(review.id)));
    }
    article.append(header, comment, actions);
    return article;
  }

  function renderReviews() {
    if (!state.ui) return;
    state.ui.list.replaceChildren();
    if (!state.reviews.length) {
      state.ui.list.append(
        createElement('div', {
          className: 'rc-community-empty',
          text: 'Ainda não há avaliações publicadas para este local.'
        })
      );
    } else {
      state.reviews.forEach(review => state.ui.list.append(renderReview(review)));
    }
    state.ui.loadMoreButton.hidden = !state.pagination?.hasMore;
    state.ui.loadMoreButton.textContent = state.busy ? 'Carregando…' : 'Carregar mais';
    state.ui.loadMoreButton.disabled = state.busy;
    state.ownReview = state.reviews.find(review => review.mine) || state.ownReview;
    renderFormState();
  }

  function renderLoading(append) {
    if (!state.ui) return;
    if (append) {
      state.ui.loadMoreButton.hidden = false;
      state.ui.loadMoreButton.textContent = 'Carregando…';
      state.ui.loadMoreButton.disabled = true;
      return;
    }
    state.ui.list.replaceChildren(
      createElement('div', {
        className: 'rc-community-loading',
        text: 'Carregando avaliações…',
        attributes: { role: 'status' }
      })
    );
  }

  async function loadReviews({ append = false } = {}) {
    if (!state.place || !state.ui) return;
    const placeAtRequest = state.place.placeKey;
    const requestId = ++state.requestSequence;
    const offset = append ? state.reviews.length : 0;
    renderLoading(append);
    setStatus();
    try {
      const data = await requestJson(
        `${API_ROOT}/places/${encodeURIComponent(placeAtRequest)}/reviews?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (requestId !== state.requestSequence || state.place?.placeKey !== placeAtRequest) return;
      const incoming = Array.isArray(data?.reviews) ? data.reviews : [];
      state.reviews = append ? [...state.reviews, ...incoming] : incoming;
      state.summary = data?.summary || { count: 0, averageRating: null };
      state.pagination = data?.pagination || { hasMore: false };
      state.ownReview = state.reviews.find(review => review.mine) || null;
      renderSummary();
      renderReviews();
    } catch (error) {
      if (requestId !== state.requestSequence) return;
      if (!append) {
        state.ui.list.replaceChildren(
          createElement('div', {
            className: 'rc-community-empty',
            text: 'Não foi possível carregar as avaliações.'
          })
        );
        state.ui.loadMoreButton.hidden = true;
      } else {
        state.ui.loadMoreButton.hidden = false;
        state.ui.loadMoreButton.disabled = false;
        state.ui.loadMoreButton.textContent = 'Tentar carregar novamente';
      }
      setStatus(error.message, 'error');
    }
  }

  function selectedRating() {
    if (!state.ui) return null;
    const selected = state.ui.form.querySelector('input[name="rc-community-rating"]:checked');
    return selected ? Number(selected.value) : null;
  }

  async function submitReview() {
    if (!state.ui || !state.place || state.busy) return;
    if (!state.ui.form.reportValidity()) return;
    const rating = selectedRating();
    const comment = state.ui.comment.value.trim();
    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      comment.length < 3 ||
      comment.length > 1200
    ) {
      setStatus('Informe uma nota de 1 a 5 e um comentário válido.', 'error');
      return;
    }
    const editingId = state.editingReviewId;
    const endpoint = editingId
      ? `${API_ROOT}/reviews/${encodeURIComponent(editingId)}`
      : `${API_ROOT}/places/${encodeURIComponent(state.place.placeKey)}/reviews`;
    const body = editingId
      ? { rating, comment }
      : {
          place: {
            provider: state.place.provider,
            name: state.place.name,
            address: state.place.address,
            latitude: state.place.latitude,
            longitude: state.place.longitude
          },
          rating,
          comment
        };
    setBusy(true);
    setStatus(editingId ? 'Salvando alteração…' : 'Publicando avaliação…');
    try {
      await requestJson(endpoint, { method: editingId ? 'PATCH' : 'POST', body, csrf: true });
      resetForm();
      state.ownReview = null;
      await loadReviews();
      setStatus(
        editingId ? 'Sua avaliação foi atualizada.' : 'Sua avaliação foi publicada.',
        'success'
      );
    } catch (error) {
      if (
        !editingId &&
        error.status === 409 &&
        error.code === 'REVIEW_ALREADY_EXISTS' &&
        error.data?.reviewId &&
        !/removida/i.test(error.message)
      ) {
        state.editingReviewId = String(error.data.reviewId);
        state.ownReview = { id: state.editingReviewId, mine: true };
        renderFormState();
        setStatus(
          'Você já avaliou este local. Revise os dados e clique em “Salvar alteração”.',
          'error'
        );
      } else {
        setStatus(error.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteReview(review) {
    if (!review?.mine || state.busy) return;
    const confirmed = global.confirm(
      'Excluir sua avaliação? O comentário não poderá ser recuperado.'
    );
    if (!confirmed) return;
    setBusy(true);
    setStatus('Excluindo sua avaliação…');
    try {
      await requestJson(`${API_ROOT}/reviews/${encodeURIComponent(review.id)}`, {
        method: 'DELETE',
        csrf: true
      });
      resetForm();
      state.ownReview = null;
      await loadReviews();
      setStatus('Sua avaliação foi excluída.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function openReport(reviewId) {
    if (!state.ui || state.busy) return;
    state.reportReviewId = reviewId;
    state.ui.report.status.hidden = true;
    state.ui.report.status.textContent = '';
    showDialog(state.ui.reportDialog);
    state.ui.report.reason.focus();
  }

  async function submitReport() {
    if (!state.ui || !state.reportReviewId || state.busy) return;
    if (!state.ui.reportForm.reportValidity()) return;
    const reason = state.ui.report.reason.value;
    const details = state.ui.report.details.value.trim();
    const reviewId = state.reportReviewId;
    setBusy(true);
    state.ui.report.status.hidden = true;
    try {
      await requestJson(`${API_ROOT}/reviews/${encodeURIComponent(reviewId)}/reports`, {
        method: 'POST',
        body: { reason, details },
        csrf: true
      });
      state.reportedReviewIds.add(reviewId);
      closeDialog(state.ui.reportDialog);
      renderReviews();
      setStatus('Denúncia enviada para análise.', 'success');
    } catch (error) {
      if (error.status === 409 && error.code === 'REPORT_ALREADY_EXISTS') {
        state.reportedReviewIds.add(reviewId);
        closeDialog(state.ui.reportDialog);
        renderReviews();
        setStatus('Você já denunciou esta avaliação.', 'info');
      } else {
        state.ui.report.status.textContent = error.message;
        state.ui.report.status.hidden = false;
      }
    } finally {
      setBusy(false);
    }
  }

  async function init(options = {}) {
    if (options?.force) {
      state.initPromise = null;
      state.initialized = false;
      state.enabled = null;
    }
    if (state.initPromise) return state.initPromise;
    state.initPromise = (async () => {
      try {
        const status = await requestJson(`${API_ROOT}/status`);
        state.enabled = status?.enabled === true;
        state.initialized = true;
        if (state.enabled) {
          await whenDomReady();
          ensureUi();
        }
        return { enabled: state.enabled, available: true, version: Number(status?.version) || 1 };
      } catch (error) {
        state.enabled = false;
        state.initialized = true;
        return {
          enabled: false,
          available: false,
          reason: error.code || (error.status === 404 ? 'NOT_INSTALLED' : 'UNAVAILABLE')
        };
      }
    })();
    return state.initPromise;
  }

  async function openPlace(rawPlace) {
    const status = await init();
    if (!status.enabled) return { opened: false, reason: status.reason || 'FEATURE_DISABLED' };
    const place = normalizePlace(rawPlace);
    const ui = ensureUi();
    state.place = place;
    state.reviews = [];
    state.summary = null;
    state.pagination = null;
    state.ownReview = null;
    state.editingReviewId = null;
    state.requestSequence += 1;
    resetForm();
    ui.title.textContent = place.name;
    ui.address.textContent = place.address || 'Endereço não informado';
    renderSummary();
    renderFormState();
    setStatus();
    state.previousFocus =
      global.HTMLElement && document.activeElement instanceof global.HTMLElement
        ? document.activeElement
        : null;
    document.body.classList.add('rc-community-open');
    showDialog(ui.dialog);
    ui.closeButton.focus();
    await loadReviews();
    return { opened: true, placeKey: place.placeKey };
  }

  function close() {
    if (state.ui && !state.busy) closeDialog(state.ui.dialog);
  }

  global.RastreonCommunity = Object.freeze({
    init,
    openPlace,
    close,
    isEnabled: () => state.enabled === true
  });
})(window);
