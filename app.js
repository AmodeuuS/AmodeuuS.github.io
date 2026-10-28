(() => {
  const cfg = window.AMODEUUS_CONFIG || {};
  const PUBLIC_MODE = Boolean(cfg.publicMode);
  if (PUBLIC_MODE) document.body.classList.add('public-build');
  const ARCHIVE_KEY = 'amodeuus.archive.v7';
  const PREVIOUS_ARCHIVE_KEY = 'amodeuus.archive.v6';
  const POSTER_REFRESH_IDS = new Set([
    'movie-01',
    'queue-mouthwashing','queue-legion','queue-gurren','queue-slime','queue-atomic-heart',
    'game-01','game-02','game-03','game-04','game-05',
    'anime-03','anime-06','anime-21','anime-22','anime-23'
  ]);
  const DONORS_KEY = 'amodeuus.donors.v3';
  const RULES_KEY = 'amodeuus.orderRules.v2';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const clone = v => JSON.parse(JSON.stringify(v ?? []));
  const load = (key, fallback) => {
    if (PUBLIC_MODE) return clone(fallback);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : clone(fallback);
    } catch {
      return clone(fallback);
    }
  };
  const save = (key, value) => { if (!PUBLIC_MODE) localStorage.setItem(key, JSON.stringify(value)); };
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const typeNames = { anime:'АНИМЕ', series:'СЕРИАЛ', movie:'ФИЛЬМ', game:'ИГРА' };
  const capitalizeOpinion = (value='') => {
    const chars = [...String(value)];
    const idx = chars.findIndex(ch => /[A-Za-zА-Яа-яЁё]/u.test(ch));
    if (idx >= 0) chars[idx] = chars[idx].toLocaleUpperCase('ru-RU');
    return chars.join('');
  };

  const mergeArchive = (defaults, previous) => {
    const storedById = new Map((previous || []).map(x => [x.id, x]));
    const merged = (defaults || []).map(x => {
      if (!storedById.has(x.id)) return x;
      const item = {...x, ...storedById.get(x.id)};
      // v6 refresh: keep user edits, but replace the covers explicitly updated in this release.
      if (POSTER_REFRESH_IDS.has(x.id)) {
        item.poster = x.poster;
        item.posterSource = x.posterSource;
      }
      return item;
    });
    const known = new Set(merged.map(x => x.id));
    (previous || []).forEach(x => { if (!known.has(x.id)) merged.push(x); });
    return merged;
  };
  let archive;
  if (PUBLIC_MODE) {
    archive = clone(cfg.archive || []);
  } else try {
    const current = localStorage.getItem(ARCHIVE_KEY);
    if (current) archive = JSON.parse(current);
    else {
      archive = mergeArchive(cfg.archive || [], load(PREVIOUS_ARCHIVE_KEY, []));
      save(ARCHIVE_KEY, archive);
    }
  } catch {
    archive = clone(cfg.archive || []);
  }
  archive = archive.map(item => ({...item, opinion: capitalizeOpinion(item.opinion || '')}));
  save(ARCHIVE_KEY, archive);

  let donors = load(DONORS_KEY, cfg.donors || []).map(d => ({...d, title: String(d.title || '')}));
  let rules = load(RULES_KEY, cfg.orderRules || []).map(rule => ({
    ...rule,
    title: rule.id === 'vip' ? 'Для шейхов' : rule.id === 'points' ? 'Для нормисов' : rule.title
  }));
  save(RULES_KEY, rules);
  let activeType = 'all';
  let editing = false;
  let detailItemId = null;

  $('#twitchLink').href = cfg.twitchUrl || '#';
  $('#twitchLink2').href = cfg.twitchUrl || '#';
  $('#spotifyLink').href = cfg.spotifyUrl || '#';
  $('#telegramLink').href = cfg.telegramUrl || '#';
  $('#year').textContent = new Date().getFullYear();

  document.addEventListener('pointermove', e => {
    const g = $('#cursorGlow');
    if (!g) return;
    g.style.left = `${e.clientX}px`;
    g.style.top = `${e.clientY}px`;
  });

  function typeName(type){ return typeNames[type] || 'КОНТЕНТ'; }
  function displayRequester(item){ return String(item.requester || '').trim() || 'Стример'; }
  function hasExplicitRequester(item){ return Boolean(String(item.requester || '').trim()); }
  function completionLabel(item){
    if (item.status === 'queue') return 'В ОЧЕРЕДИ';
    const progress = String(item.watched || '').trim();
    if (progress && progress.toLowerCase() !== 'фулл') return progress.toUpperCase();
    if (item.status === 'planned') return 'В ПЛАНАХ';
    return item.type === 'game' ? 'ПРОЙДЕНО' : 'ПРОСМОТРЕНО';
  }
  function statusClass(item){
    if (item.status === 'queue') return 'queue';
    if (item.status === 'planned') return 'planned';
    return 'completed';
  }
  function formatAmount(v){
    return `${new Intl.NumberFormat('ru-RU').format(Number(v) || 0)} ₽`;
  }

  function ratingParts(item){
    const special = String(item.ratingText || '').trim();
    if (special && !/^\d+(?:[.,]\d+)?\/10$/i.test(special)) return {kind:'special', text:special};
    const numeric = item.score !== null && item.score !== '' && !Number.isNaN(Number(item.score)) ? Number(item.score) : null;
    if (numeric !== null) return {kind:'numeric', text:Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1)};
    if (special) return {kind:'special', text:special};
    return {kind:'empty', text:'—'};
  }
  function ratingMarkup(item){
    const r = ratingParts(item);
    if (r.kind === 'special') return `<div class="score-badge special"><b>${esc(r.text)}</b></div>`;
    return `<div class="score-badge${r.kind==='empty'?' empty':''}"><b>${esc(r.text)}</b><span>/10</span></div>`;
  }

  function posterMarkup(item, cls=''){
    const poster = String(item.poster || '').trim();
    const fallback = esc((item.title || '?').slice(0, 2).toUpperCase());
    return poster
      ? `<img class="${cls}" src="${esc(poster)}" alt="Постер: ${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="poster-fallback poster-fallback-hidden">${fallback}</div>`
      : `<div class="poster-fallback">${fallback}</div>`;
  }

  function cardMarkup(item){
    return `<article class="media-card" data-card="${esc(item.id)}" role="button" tabindex="0" aria-label="Открыть: ${esc(item.title)}">
      <div class="media-poster">
        ${posterMarkup(item)}
        <span class="type-badge">${typeName(item.type)}</span>
        <span class="status-badge ${statusClass(item)}">${completionLabel(item)}</span>
        ${ratingMarkup(item)}
      </div>
      <div class="media-body">
        <div class="media-meta">${esc(item.year || 'ГОД —')} // ЗАКАЗЧИК: ${esc(displayRequester(item))}</div>
        <h3 class="media-title">${esc(item.title)}</h3>
        <p class="media-opinion">${esc(item.opinion || 'Мнение пока не записано.')}</p>
        <div class="card-hint">ОТКРЫТЬ КАРТОЧКУ ↗</div>
      </div>
      <button class="btn card-edit edit-only" type="button" data-edit="${esc(item.id)}">EDIT</button>
    </article>`;
  }

  function renderArchive(){
    const q = $('#searchInput').value.trim().toLowerCase();
    const status = $('#statusSelect').value;
    const sort = $('#sortSelect').value;

    let list = archive.filter(item => {
      if (activeType !== 'all' && item.type !== activeType) return false;
      if (status === 'completed' && item.status !== 'watched') return false;
      if (status === 'queue' && item.status !== 'queue') return false;
      if (status === 'planned' && item.status !== 'planned') return false;
      if (q && !`${item.title} ${item.opinion || ''} ${displayRequester(item)}`.toLowerCase().includes(q)) return false;
      return true;
    });

    list.sort((a,b) => {
      if (sort === 'score-desc') return (Number(b.score) || -1) - (Number(a.score) || -1);
      if (sort === 'score-asc') return (Number(a.score) || 99) - (Number(b.score) || 99);
      if (sort === 'title') return String(a.title).localeCompare(String(b.title), 'ru');
      return (Number(a.sourceOrder) || 99999) - (Number(b.sourceOrder) || 99999);
    });

    const completed = archive.filter(x => x.status === 'watched').length;
    $('#archiveCount').textContent = completed;
    $('#archiveGrid').innerHTML = list.map(cardMarkup).join('');
    $('#emptyState').classList.toggle('hidden', list.length > 0);

    $$('[data-card]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        openDetail(card.dataset.card);
      });
      card.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
          e.preventDefault();
          openDetail(card.dataset.card);
        }
      });
    });
    $$('[data-edit]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      openEntry(btn.dataset.edit);
    }));
  }

  function queueItems(){
    return archive
      .filter(x => x.status === 'queue' && hasExplicitRequester(x))
      .sort((a,b) => (Number(a.queueOrder) || 9999) - (Number(b.queueOrder) || 9999));
  }

  function persistQueueOrderFromDom(){
    const ids = $$('[data-queue-id]', $('#queueList')).map(row => row.dataset.queueId);
    ids.forEach((id, index) => {
      const item = archive.find(x => x.id === id);
      if (item) item.queueOrder = index + 1;
    });
    save(ARCHIVE_KEY, archive);
  }

  function refreshQueueNumbers(){
    $$('[data-queue-id]', $('#queueList')).forEach((row, i) => {
      const index = $('.queue-index', row);
      if (index) index.textContent = String(i + 1).padStart(2, '0');
    });
  }

  function enableQueueDrag(){
    const listEl = $('#queueList');
    $$('[data-drag-handle]', listEl).forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        if (!editing) return;
        const row = handle.closest('[data-queue-id]');
        if (!row) return;
        e.preventDefault();
        e.stopPropagation();
        const pointerId = e.pointerId;
        row.classList.add('dragging');
        document.body.classList.add('queue-dragging');
        try { handle.setPointerCapture(pointerId); } catch {}

        const onMove = ev => {
          if (ev.pointerId !== pointerId) return;
          ev.preventDefault();
          const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-queue-id]');
          if (!target || target === row || target.parentElement !== listEl) return;
          const rect = target.getBoundingClientRect();
          const before = ev.clientY < rect.top + rect.height / 2;
          listEl.insertBefore(row, before ? target : target.nextSibling);
          refreshQueueNumbers();
        };
        const onEnd = ev => {
          if (ev.pointerId !== pointerId) return;
          row.classList.remove('dragging');
          document.body.classList.remove('queue-dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onEnd);
          window.removeEventListener('pointercancel', onEnd);
          persistQueueOrderFromDom();
          renderQueue();
        };
        window.addEventListener('pointermove', onMove, {passive:false});
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
      });
    });
  }

  function renderQueue(){
    const list = queueItems();
    const el = $('#queueList');
    if (!list.length){
      el.innerHTML = `<div class="queue-empty">QUEUE EMPTY // очередь пуста</div>`;
      return;
    }
    el.innerHTML = `${editing ? '<div class="queue-edit-hint">EDIT MODE // тяни за <b>⠿</b>, чтобы изменить номер в очереди</div>' : ''}` + list.map((item, i) => `
      <div class="queue-row" role="button" tabindex="0" data-queue-id="${esc(item.id)}" aria-label="Открыть: ${esc(item.title)}">
        <span class="queue-drag-handle edit-only" data-drag-handle title="Перетащить" aria-label="Изменить место в очереди">⠿</span>
        <span class="queue-index">${String(i+1).padStart(2,'0')}</span>
        <span class="queue-thumb">${item.poster ? `<img src="${esc(item.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}</span>
        <span class="queue-main">
          <b class="queue-title">${esc(item.title)}</b>
          <small class="queue-who">${typeName(item.type)} // ЗАКАЗЧИК: ${esc(displayRequester(item))}</small>
        </span>
        <span class="queue-status">WAITING</span>
      </div>`).join('');
    $$('[data-queue-id]', el).forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('[data-drag-handle]')) return;
        openDetail(row.dataset.queueId);
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail(row.dataset.queueId);
        }
      });
    });
    enableQueueDrag();
  }

  function formatRuleText(text=''){
    let safe = esc(text);
    const markers = ['Я посмотрю или поиграю', 'В случае с игрой', 'Есть шанс,', 'ЗАПРЕЩАЮТСЯ:', 'Короче если есть вопросы'];
    markers.forEach(marker => {
      safe = safe.replace(marker, `</p><p>${marker === 'ЗАПРЕЩАЮТСЯ:' ? '<strong class="rule-danger">ЗАПРЕЩАЮТСЯ:</strong>' : esc(marker)}`);
    });
    safe = safe
      .replace(/2 часа - 1000р, 4ч - 2200р, 8 часов - 4500р\./g, '<span class="rule-price">2 часа — 1000 ₽</span><span class="rule-price">4 часа — 2200 ₽</span><span class="rule-price">8 часов — 4500 ₽</span>')
      .replace(/2 часа - 40 000 баллов\./g, '<span class="rule-price">2 часа — 40 000 баллов</span>');
    return `<p>${safe}</p>`;
  }

  function renderRules(){
    const el = $('#rulesList');
    if (!rules.length){
      el.innerHTML = `<div class="rule-empty">Правила пока не заполнены.</div>`;
      return;
    }
    el.innerHTML = rules.map((rule, i) => `
      <section class="rule-group">
        <div class="rule-group-head">
          <span class="rule-no">${String(i+1).padStart(2,'0')}</span>
          <div><b>${esc(rule.title || `ПРАВИЛА ${i+1}`)}</b><small>${esc(rule.subtitle || '')}</small></div>
        </div>
        <div class="rule-copy">${formatRuleText(rule.text || '')}</div>
      </section>`).join('');
  }

  function renderDonors(){
    const list = [...donors].sort((a,b) => Number(b.amount)-Number(a.amount)).slice(0,5);
    $('#donorBoard').innerHTML = list.map((d,i) => `
      <article class="donor">
        <span class="donor-rank">0${i+1}</span>
        <div class="donor-label">${i===0 ? 'TOP DONATOR' : 'HALL OF FAME'}</div>
        <div class="donor-title"><span>ТИТУЛ // </span>${esc(d.title || 'не назначен')}</div>
        <div class="donor-name">${esc(d.name)}</div>
        <div class="donor-amount"><b>${formatAmount(d.amount).replace(' ₽','')}</b> ₽</div>
      </article>`).join('');
  }

  function renderAll(){
    renderArchive();
    renderQueue();
    renderRules();
    renderDonors();
  }

  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;
    renderArchive();
  }));
  $('#searchInput').addEventListener('input', renderArchive);
  $('#statusSelect').addEventListener('change', renderArchive);
  $('#sortSelect').addEventListener('change', renderArchive);

  $('#editToggle').addEventListener('click', () => {
    if (PUBLIC_MODE) return;
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    $('#editToggle').setAttribute('aria-pressed', String(editing));
    $('#editToggle').textContent = editing ? 'EDIT: ON' : 'EDIT';
    renderQueue();
  });

  const detailDialog = $('#detailDialog');
  function openDetail(id){
    const item = archive.find(x => x.id === id);
    if (!item) return;
    detailItemId = id;

    const poster = String(item.poster || '').trim();
    $('#detailPoster').innerHTML = poster
      ? `<img src="${esc(poster)}" alt="Постер: ${esc(item.title)}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="detail-poster-fallback">${esc((item.title || '?').slice(0,2).toUpperCase())}</div>`
      : `<div class="detail-poster-fallback visible">${esc((item.title || '?').slice(0,2).toUpperCase())}</div>`;

    $('#detailTitle').textContent = item.title;
    $('#detailKicker').textContent = `// ${typeName(item.type)} ARCHIVE ENTRY`;
    $('#detailMeta').innerHTML = `<span>${completionLabel(item)}</span><span>${esc(item.year || 'ГОД —')}</span>`;
    const rating = ratingParts(item);
    $('#detailRating').innerHTML = rating.kind === 'special'
      ? `<span class="detail-rating-label">ОЦЕНКА</span><b class="detail-rating-special">${esc(rating.text)}</b>`
      : `<span class="detail-rating-label">ОЦЕНКА</span><b>${esc(rating.text)}</b><small>/10</small>`;
    $('#detailRequester').innerHTML = `ЗАКАЗЧИК // <b>${esc(displayRequester(item))}</b>`;
    $('#detailOpinion').textContent = item.opinion || 'Мнение пока не записано.';
    detailDialog.showModal();
  }
  $('#detailClose').addEventListener('click', () => detailDialog.close());
  $('#detailEditBtn').addEventListener('click', () => {
    const id = detailItemId;
    detailDialog.close();
    openEntry(id);
  });

  const archiveDialog = $('#archiveDialog');
  $('#addArchiveBtn').addEventListener('click', () => openEntry());
  function openEntry(id){
    const item = id ? archive.find(x => x.id === id) : null;
    $('#dialogTitle').textContent = item ? 'РЕДАКТИРОВАТЬ ЗАПИСЬ' : 'НОВАЯ ЗАПИСЬ';
    $('#entryId').value = item?.id || '';
    $('#entryTitle').value = item?.title || '';
    $('#entryType').value = item?.type || 'movie';
    $('#entryStatus').value = item?.status || 'watched';
    $('#entryScore').value = item?.score ?? '';
    $('#entryYear').value = item?.year ?? '';
    $('#entryRequester').value = item?.requester || '';
    $('#entryImage').value = item?.poster || '';
    $('#entryOpinion').value = item?.opinion || '';
    $('#deleteEntryBtn').classList.toggle('hidden', !item);
    archiveDialog.showModal();
  }

  $('#saveEntryBtn').addEventListener('click', () => {
    const title = $('#entryTitle').value.trim();
    if (!title){ $('#entryTitle').focus(); return; }

    const status = $('#entryStatus').value;
    const requester = $('#entryRequester').value.trim();
    if (status === 'queue' && !requester){
      alert('Чтобы добавить позицию в очередь, укажи заказчика.');
      $('#entryRequester').focus();
      return;
    }

    const id = $('#entryId').value;
    const old = id ? archive.find(x => x.id === id) : null;
    const rawScore = $('#entryScore').value.trim();
    const score = rawScore === '' ? null : Math.min(10, Math.max(1, Number(rawScore)));
    const maxSource = Math.max(0, ...archive.map(x => Number(x.sourceOrder) || 0));
    const maxQueue = Math.max(0, ...archive.map(x => Number(x.queueOrder) || 0));

    const item = {
      ...(old || {}),
      id: id || `entry-${Date.now()}`,
      title,
      type: $('#entryType').value,
      status,
      score,
      ratingText: score !== null ? `${Number.isInteger(score) ? score : score.toFixed(1)}/10` : (old?.ratingText && old?.score == null ? old.ratingText : ''),
      year: $('#entryYear').value.trim(),
      requester,
      poster: $('#entryImage').value.trim(),
      opinion: capitalizeOpinion($('#entryOpinion').value.trim()),
      sourceOrder: old?.sourceOrder ?? (maxSource + 1),
      queueOrder: status === 'queue' ? (old?.queueOrder || maxQueue + 1) : null,
      date: old?.date || ''
    };

    if (id){
      const idx = archive.findIndex(x => x.id === id);
      archive[idx] = item;
    } else {
      archive.push(item);
    }
    save(ARCHIVE_KEY, archive);
    archiveDialog.close();
    renderAll();
  });

  $('#deleteEntryBtn').addEventListener('click', () => {
    const id = $('#entryId').value;
    if (!id) return;
    if (confirm('Удалить эту запись из архива?')){
      archive = archive.filter(x => x.id !== id);
      save(ARCHIVE_KEY, archive);
      archiveDialog.close();
      renderAll();
    }
  });

  const rulesDialog = $('#rulesDialog');
  $('#editRulesBtn').addEventListener('click', () => {
    $('#rulesVipEditor').value = rules.find(x => x.id === 'vip')?.text || rules[0]?.text || '';
    $('#rulesPointsEditor').value = rules.find(x => x.id === 'points')?.text || rules[1]?.text || '';
    rulesDialog.showModal();
  });
  $('#saveRulesBtn').addEventListener('click', () => {
    rules = [
      {id:'vip', title:'Для шейхов', subtitle:'ДОНАТ / ПОДДЕРЖКА', text:$('#rulesVipEditor').value.trim()},
      {id:'points', title:'Для нормисов', subtitle:'ЗА БАЛЛЫ КАНАЛА', text:$('#rulesPointsEditor').value.trim()}
    ].filter(x => x.text);
    save(RULES_KEY, rules);
    rulesDialog.close();
    renderRules();
  });

  const donorDialog = $('#donorDialog');
  function resortDonorEditor(){
    const box = $('#donorInputs');
    const rows = $$('.donor-input-row', box).sort((a,b) => {
      const av = Number($('.donor-edit-amount', a)?.value || 0);
      const bv = Number($('.donor-edit-amount', b)?.value || 0);
      return bv - av;
    });
    rows.forEach((row, i) => {
      $('.donor-edit-rank', row).textContent = `0${i+1}`;
      box.appendChild(row);
    });
  }

  $('#editDonorsBtn').addEventListener('click', () => {
    const list = [...donors].sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5);
    while (list.length < 5) list.push({name:'',title:'',amount:0});
    $('#donorInputs').innerHTML = list.map((d,i) => `
      <div class="donor-input-row">
        <span class="donor-edit-rank">0${i+1}</span>
        <input class="donor-edit-name" value="${esc(d.name)}" placeholder="ник">
        <input class="donor-edit-title" value="${esc(d.title || '')}" placeholder="титул">
        <input class="donor-edit-amount" type="number" min="0" value="${Number(d.amount)||0}" placeholder="сумма">
      </div>`).join('');
    $$('.donor-edit-amount', $('#donorInputs')).forEach(input => input.addEventListener('input', resortDonorEditor));
    donorDialog.showModal();
  });
  $('#saveDonorsBtn').addEventListener('click', () => {
    resortDonorEditor();
    donors = $$('.donor-input-row', $('#donorInputs')).map((row, i) => ({
      name: $('.donor-edit-name', row).value.trim() || `donor_${i+1}`,
      title: $('.donor-edit-title', row).value.trim(),
      amount: Number($('.donor-edit-amount', row).value || 0)
    })).sort((a,b)=>b.amount-a.amount).slice(0,5);
    save(DONORS_KEY, donors);
    donorDialog.close();
    renderDonors();
  });

  const backToTop = $('#backToTop');
  const updateBackToTop = () => backToTop.classList.toggle('visible', window.scrollY > Math.max(420, window.innerHeight * .55));
  window.addEventListener('scroll', updateBackToTop, {passive:true});
  window.addEventListener('resize', updateBackToTop, {passive:true});
  backToTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
  updateBackToTop();

  [detailDialog, archiveDialog, rulesDialog, donorDialog].forEach(dialog => {
    dialog.addEventListener('click', e => {
      if (e.target === dialog) dialog.close();
    });
  });

  renderAll();
})();