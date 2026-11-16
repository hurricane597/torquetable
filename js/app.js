/* Torque Table UI: a customer storefront and the chef's desk, rendered from Store. */
(() => {
  const S = Store;
  const $ = s => document.querySelector(s);
  const view = $('#view'), sheet = $('#sheet'), scrim = $('#scrim'), toastEl = $('#toast');

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '€' + (Number.isInteger(n) ? n : n.toFixed(2));
  const dayLong = iso => S.fromIso(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayShort = iso => S.fromIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const stamp = t => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cutoffText = c => `${DAY_NAMES[c.cutoff.getDay()]} ${c.cutoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];

  const ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    how: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9"/><path d="M12 17h.01"/>',
    area: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>',
    contact: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
    orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    prep: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M14 10v4M10 16v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>',
  };
  const icon = n => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  const CUSTOMER_NAV = [['', 'Home', 'home'], ['menu', 'Weekly Menu', 'menu'], ['how', 'How It Works', 'how'], ['area', 'Delivery Area', 'area'], ['contact', 'Contact', 'contact']];
  const CHEF_NAV = [['chef', 'Orders', 'orders'], ['chef/prep', 'Prep list', 'prep'], ['chef/menu', 'Menu', 'menu'], ['chef/settings', 'Settings', 'settings']];

  /* The chef's desk exists only on the chef's own page (chef.html) and in the chef's phone app, never on the customer site. */
  const CHEF_APP = !!(window.TT_CHEF || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App));

  let route = '', ui = { tried: false, placing: false, orderFilter: 'active', prepDate: null, policy: null };

  /* ---------- shell ---------- */
  function renderShell() {
    const chef = route.startsWith('chef');
    const nav = chef ? CHEF_NAV : CUSTOMER_NAV;
    const on = r => (r === route || (r === 'menu' && route === 'checkout')) ? ' class="on" aria-current="page"' : '';
    $('#nav').innerHTML = nav.map(([r, label]) => `<a href="#/${r}"${on(r)}>${label}</a>`).join('');
    $('#tabs').innerHTML = nav.map(([r, label, ic]) => `<a href="#/${r}"${on(r)}>${icon(ic)}<span>${label.replace('Weekly ', '').replace('Delivery ', '').replace(' It Works', ' it works')}</span></a>`).join('');
    const mine = S.state.mine.length;
    $('#actions').innerHTML = chef
      ? `<a class="pill-link" href="#/menu">${document.documentElement.classList.contains('native') ? 'Preview customer site' : 'Customer view'}</a>`
      : `${mine ? `<a class="pill-link" href="#/orders">My orders</a>` : ''}${CHEF_APP ? `<a class="pill-link ghost" href="#/chef">Chef's desk</a>` : ''}`;
    document.body.classList.toggle('chef', chef);
    const ct = S.cart(), bar = $('#cartbar');
    const show = !chef && ct.count > 0 && !['checkout'].includes(route) && !route.startsWith('order');
    bar.hidden = !show;
    if (show) bar.innerHTML = `<a href="#/checkout"><span><b>${ct.count} ${ct.count === 1 ? 'meal' : 'meals'}</b> · ${money(ct.total)}</span><span>Review order →</span></a>`;
  }

  function render() {
    route = location.hash.replace(/^#\/?/, '');
    if (route.startsWith('chef') && !CHEF_APP) { location.replace('#/'); return; }
    renderShell();
    const [a, b] = route.split('/');
    const y = window.scrollY;
    if (a === 'chef') { if (S.remote && !S.live.isChef) chefLogin(); else ({ undefined: chefOrders, prep: chefPrep, menu: chefMenu, settings: chefSettings }[b] || chefOrders)(); }
    else if (a === 'order' && b) orderPage(b);
    else ({ '': home, menu: menuPage, how: howPage, area: areaPage, contact: contactPage, checkout: checkout, orders: myOrders }[a] || home)();
    if (S.remote && S.live.error) view.insertAdjacentHTML('afterbegin', '<p class="notice closed"><b>Can\'t reach the server.</b> You are seeing the last saved version; ordering needs a connection.</p>');
    if (render.last === route) window.scrollTo(0, y); else { window.scrollTo(0, 0); render.last = route; }
  }

  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 3200);
  }
  function openSheet(html) {
    sheet.innerHTML = html; sheet.inert = false; sheet.classList.add('on'); scrim.classList.add('on'); sheet.scrollTop = 0;
  }
  function closeSheet() { sheet.classList.remove('on'); scrim.classList.remove('on'); sheet.inert = true; ui.sheet = null; }

  /* ---------- shared pieces ---------- */
  function windowBanner(c) {
    if (c.open) return `<p class="notice"><b>Ordering is open.</b> Order by ${cutoffText(c)} for delivery on ${list(c.dates.map(dayLong))}.</p>`;
    return `<p class="notice closed"><b>This week's orders are closed.</b> ${c.reopens ? `Ordering reopens on ${c.reopens.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'The next ordering window'} for delivery on ${list(c.dates.map(dayLong))}.</p>`;
  }
  const statusPill = s => `<span class="status s-${s}">${STATUS[s]}</span>`;
  const stepper = (m, q, off) => q
    ? `<div class="stepper"><button data-act="qty" data-id="${m.id}" data-d="-1" aria-label="One less ${esc(m.name)}">−</button><b aria-live="polite">${q}</b><button data-act="qty" data-id="${m.id}" data-d="1" aria-label="One more ${esc(m.name)}"${q >= m.left ? ' disabled' : ''}>+</button></div>`
    : `<button class="btn small" data-act="qty" data-id="${m.id}" data-d="1"${off ? ' disabled' : ''}>Add</button>`;

  function radiusMap() {
    const st = S.state, cx = 200, cy = 200, R = km => 40 * Math.sqrt(km); /* square-root scale keeps the inner districts apart */
    const pts = st.areas.map(a => {
      const r = a.deg * Math.PI / 180, x = cx + Math.cos(r) * R(a.km), y = cy + Math.sin(r) * R(a.km), inside = S.inRadius(a);
      const left = (x < cx - 4 && x > 80) || x > 300;
      return `<g class="${inside ? 'in' : 'out'}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/><text x="${(x + (left ? -8 : 8)).toFixed(1)}" y="${(y + 4).toFixed(1)}"${left ? ' text-anchor="end"' : ''}>${esc(a.name)}</text></g>`;
    }).join('');
    return `<svg class="map" viewBox="0 0 400 400" role="img" aria-label="Map of the ${st.settings.radiusKm} km delivery radius">
      <path class="road" d="M-10 150 C100 190 150 140 200 200 S330 240 410 190M90 -10 C110 110 175 150 200 200 S240 330 215 410M-10 310 C110 290 160 250 200 200 S310 110 410 50"/>
      <circle class="ring" cx="${cx}" cy="${cy}" r="${R(st.settings.radiusKm).toFixed(1)}"/>
      ${pts}
      <circle class="chef-dot" cx="${cx}" cy="${cy}" r="7"/><text class="chef-label" x="${cx}" y="${cy - 14}" text-anchor="middle">Kitchen</text>
    </svg>`;
  }

  /* ---------- customer: home ---------- */
  function home() {
    const st = S.state, c = S.cycle();
    const meals = S.publishedMeals().slice(0, 3);
    view.innerHTML = `
      <section class="hero">
        <img src="img/logo.webp" alt="Torque Table — Nourish &amp; Flow" width="660" height="530">
        <h1>Healthy homemade meals, delivered locally</h1>
        <p class="lead">Fresh weekly meal prep in Hamburg from ${esc(st.settings.chefName)}. ${c.open ? `Order by ${DAY_NAMES[c.cutoff.getDay()]} for ${list(c.dates.map(d => DAY_NAMES[S.fromIso(d).getDay()]))} delivery.` : 'This week is fully booked in — the next menu opens soon.'}</p>
        <div class="hero-actions"><a class="btn" href="#/menu">See this week's menu</a><a class="btn outline" href="#/area">Check delivery area</a></div>
      </section>
      ${windowBanner(c)}
      <div class="rule"><span>This week</span></div>
      <div class="cards three">${meals.map(m => `<a class="card meal-teaser" href="#/menu"><small>${esc(m.tag)}</small><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p><b>${money(m.price)}</b></a>`).join('')}</div>
      <div class="rule"><span>How it works</span></div>
      ${steps()}
      <p class="script center">Nourish &amp; Flow</p>`;
  }
  const steps = () => {
    const s = S.state.settings, c = S.cycle();
    return `<ol class="steps">
      <li><b>Choose your meals</b><span>Browse the weekly menu and pick how many of each you'd like. Minimum order ${money(s.minOrder)}.</span></li>
      <li><b>Tell us where</b><span>We deliver within ${s.radiusKm} km of ${esc(s.base)}. Pick a delivery day and a two-hour window.</span></li>
      <li><b>Order by ${DAY_NAMES[c.cutoff.getDay()]}</b><span>Orders close ${cutoffText(c)} so everything can be cooked fresh to order.</span></li>
      <li><b>Pay cash at the door</b><span>No card, no account. You pay in cash when your meals arrive.</span></li>
    </ol>`;
  };

  /* ---------- customer: menu ---------- */
  function menuPage() {
    const st = S.state, c = S.cycle(), meals = S.publishedMeals();
    view.innerHTML = `
      <header class="page-head"><h1>Weekly Menu</h1><p>Cooked to order by ${esc(st.settings.chefName)}. Every meal is one generous serving.</p></header>
      ${windowBanner(c)}
      ${meals.length ? `<div class="cards two">${meals.map(m => {
        const q = st.cart[m.id] || 0, sold = m.left <= 0;
        return `<article class="card meal${sold ? ' sold' : ''}">
          <div class="meal-top"><small>${esc(m.tag)}</small>${sold ? '<span class="status s-cancelled">Sold out</span>' : m.left <= 5 ? `<span class="status s-preparing">Only ${m.left} left</span>` : ''}</div>
          <h3>${esc(m.name)}</h3>
          <p>${esc(m.desc)}</p>
          <p class="fine">${esc(m.portion)} · Allergens: ${esc(m.allergens)}</p>
          <div class="meal-foot"><b class="price">${money(m.price)}</b><button class="link" data-act="meal" data-id="${m.id}">Details</button><span class="grow"></span>${sold ? '' : stepper(m, q, !c.open)}</div>
        </article>`;
      }).join('')}</div>` : '<p class="empty">No menu is published right now. Please check back soon.</p>'}
      <p class="fine center">Minimum order ${money(st.settings.minOrder)} · Cash on delivery · Delivery within ${st.settings.radiusKm} km</p>`;
  }
  function mealSheet(id) {
    const m = S.meal(id); if (!m) return;
    openSheet(`<div class="sheet-head"><div><small>${esc(m.tag)}</small><h2>${esc(m.name)}</h2></div><button class="x" data-act="close-sheet" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <p class="lead">${esc(m.desc)}</p>
        <dl class="facts"><div><dt>Price</dt><dd>${money(m.price)}</dd></div><div><dt>Portion</dt><dd>${esc(m.portion)}</dd></div>
        <div class="wide"><dt>Ingredients</dt><dd>${esc(m.ingredients)}</dd></div>
        <div class="wide"><dt>Allergens</dt><dd>${esc(m.allergens)}</dd></div>
        <div class="wide"><dt>Reheating</dt><dd>${esc(m.reheat)}</dd></div>
        <div class="wide"><dt>Cooked by</dt><dd>${esc(S.state.settings.chefName)}, in a small-batch home kitchen.</dd></div></dl>
      </div>`);
  }

  /* ---------- customer: static pages ---------- */
  function howPage() {
    view.innerHTML = `<header class="page-head"><h1>How It Works</h1><p>Four steps, no account and no card.</p></header>${steps()}
      <div class="card"><h3>Changing your mind</h3><p>You can cancel from “My orders” any time before the chef starts preparing your meals. Once cooking has begun the order can no longer be cancelled.</p></div>
      <p class="center"><a class="btn" href="#/menu">See this week's menu</a></p>`;
  }
  function areaPage() {
    const st = S.state, sel = ui.areaCheck && S.area(ui.areaCheck);
    view.innerHTML = `<header class="page-head"><h1>Delivery Area</h1><p>We deliver within ${st.settings.radiusKm} km of ${esc(st.settings.base)}. Distances are approximate.</p></header>
      <div class="split">
        <div class="card map-card">${radiusMap()}<p class="fine center">Illustration, not to scale.</p></div>
        <div class="card">
          <h3>Check your neighbourhood</h3>
          <label class="field"><span>Neighbourhood</span><select data-act="area-check"><option value="">Choose…</option>${st.areas.map(a => `<option value="${a.id}"${ui.areaCheck === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
          ${sel ? (S.inRadius(sel)
            ? `<p class="notice"><b>Yes, we deliver to ${esc(sel.name)}.</b> It's about ${sel.km} km from the kitchen.</p><a class="btn" href="#/menu">See this week's menu</a>`
            : `<p class="notice closed"><b>Sorry, ${esc(sel.name)} is outside our area.</b> It's about ${sel.km} km away and we deliver up to ${st.settings.radiusKm} km.</p>`) : ''}
          <ul class="area-list">${st.areas.slice().sort((a, b) => a.km - b.km).map(a => `<li class="${S.inRadius(a) ? '' : 'off'}"><span>${esc(a.name)}</span><span>${a.km} km${S.inRadius(a) ? '' : ' · not covered'}</span></li>`).join('')}</ul>
        </div>
      </div>`;
  }
  function contactPage() {
    const s = S.state.settings;
    view.innerHTML = `<header class="page-head"><h1>Contact</h1><p>Questions about allergens, an order or delivery? Get in touch.</p></header>
      <div class="card"><dl class="facts"><div><dt>Chef</dt><dd>${esc(s.chefName)}</dd></div><div><dt>Phone / WhatsApp</dt><dd>${esc(s.chefPhone)}</dd></div><div class="wide"><dt>Email</dt><dd>${esc(s.chefEmail)}</dd></div>
      <div class="wide"><dt>Deliveries</dt><dd>${list(s.deliveryDays.map(d => DAY_NAMES[d] + 's'))}, ${esc(s.windows.join(' · '))}</dd></div></dl></div>
      <p class="script center">Nourish &amp; Flow</p>`;
  }

  /* ---------- customer: checkout ---------- */
  function checkout() {
    const st = S.state, c = S.cycle(), ct = S.cart(), d = st.draft;
    if (!ct.lines.length) { view.innerHTML = `<header class="page-head"><h1>Your order</h1></header>${ct.notes.map(n => `<p class="notice closed">${esc(n)}</p>`).join('')}<p class="empty">Your order is empty.</p><p class="center"><a class="btn" href="#/menu">Browse the menu</a></p>`; return; }
    if (!d.date || !c.dates.includes(d.date)) d.date = c.dates[0];
    const wins = S.windowsFor(d.date);
    if (!wins.some(w => w.label === d.window && !w.full)) d.window = (wins.find(w => !w.full) || {}).label || '';
    if (!d.channel) d.channel = 'SMS';
    const e = ui.tried ? S.validate(d) : {};
    const a = S.area(d.areaId);
    const areaMsg = d.areaId === 'other' ? `<p class="err">We only deliver to the listed neighbourhoods for now.</p>`
      : a && !S.inRadius(a) ? `<p class="err">${esc(a.name)} is ${a.km} km away — outside our ${st.settings.radiusKm} km delivery radius, so we can't take this order.</p>`
      : a ? `<p class="ok">✓ We deliver to ${esc(a.name)}.</p>` : (e.areaId ? `<p class="err">${e.areaId}</p>` : '');
    const blocked = !c.open || ct.short > 0;
    const f = (k, label, attrs = '') => `<label class="field${e[k] ? ' bad' : ''}"><span>${label}</span><input data-f="${k}" value="${esc(d[k] || '')}" ${attrs}>${e[k] ? `<p class="err">${e[k]}</p>` : ''}</label>`;
    view.innerHTML = `
      <header class="page-head"><h1>Your order</h1><p>Review your meals, then tell us where to bring them.</p></header>
      ${!c.open ? windowBanner(c) : ''}
      ${ct.notes.map(n => `<p class="notice closed">${esc(n)}</p>`).join('')}
      <div class="split checkout">
        <section class="card">
          <h3>Meals</h3>
          <ul class="lines">${ct.lines.map(l => `<li><div><b>${esc(l.name)}</b><span>${money(l.price)} each</span></div>${stepper(S.meal(l.id), l.qty)}<b class="num">${money(l.price * l.qty)}</b></li>`).join('')}</ul>
          <div class="total"><span>Order total</span><b>${money(ct.total)}</b></div>
          ${ct.short > 0 ? `<p class="notice closed">Minimum order is ${money(st.settings.minOrder)}. Add <b>${money(ct.short)}</b> more to continue. <a class="link" href="#/menu">Add meals</a></p>` : ''}
        </section>
        <form class="card form" id="checkout-form" novalidate>
          <h3>Your order &amp; delivery details</h3>
          ${f('name', 'Full name', 'autocomplete="name"')}
          ${f('phone', 'Phone number', 'type="tel" inputmode="tel" autocomplete="tel"')}
          ${f('address', 'Street address', 'autocomplete="street-address"')}
          <label class="field${e.areaId ? ' bad' : ''}"><span>Neighbourhood</span><select data-f="areaId" data-rerender><option value="">Choose…</option>${st.areas.map(x => `<option value="${x.id}"${d.areaId === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="other"${d.areaId === 'other' ? ' selected' : ''}>My area isn't listed</option></select>${areaMsg}</label>
          <div class="pair">
            <label class="field"><span>Delivery day</span><select data-f="date" data-rerender>${c.dates.map(x => `<option value="${x}"${d.date === x ? ' selected' : ''}>${dayLong(x)}</option>`).join('')}</select></label>
            <label class="field${e.window ? ' bad' : ''}"><span>Delivery window</span><select data-f="window">${wins.map(w => `<option value="${esc(w.label)}"${d.window === w.label ? ' selected' : ''}${w.full ? ' disabled' : ''}>${esc(w.label)}${w.full ? ' — full' : ''}</option>`).join('')}</select>${e.window ? `<p class="err">${e.window}</p>` : ''}</label>
          </div>
          <label class="field"><span>Delivery notes <i>(optional)</i></span><input data-f="notes" value="${esc(d.notes || '')}" placeholder="Gate code, leave with a neighbour…"></label>
          <label class="field"><span>Send my order updates by</span><select data-f="channel">${['SMS', 'WhatsApp'].map(x => `<option${d.channel === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="radio"><input type="radio" checked> <span><b>Cash on delivery</b><small>Pay ${money(ct.total)} in cash when your meals arrive.</small></span></label>
          <button class="btn wide" type="submit" ${blocked || ui.placing ? 'disabled' : ''}>${ui.placing ? 'Placing your order…' : 'Place cash order'}</button>
          ${!c.open ? '<p class="fine center">Orders are closed for this week.</p>' : ''}
        </form>
      </div>`;
  }

  async function submitOrder() {
    if (ui.placing) return;
    const st = S.state;
    ui.tried = true;
    if (Object.keys(S.validate(st.draft)).length) { render(); const bad = view.querySelector('.bad input, .bad select'); if (bad) bad.focus(); return; }
    ui.placing = true; render();
    const key = st.checkoutKey;
    const [r] = await Promise.all([S.placeOrder(st.draft, key), new Promise(done => setTimeout(done, 500))]);
    ui.placing = false;
    if (r.order) { ui.tried = false; location.hash = '#/order/' + r.order.ref; return; }
    render();
    toast({
      closed: 'Orders have just closed for this week.', stale: 'Some meals just sold out or changed — please review your order.',
      minimum: 'Your order is below the minimum.', empty: 'Your order is empty.', invalid: 'Please check the highlighted fields.',
      window: 'That delivery window just filled up. Please choose another.', network: 'Could not reach the server. Your order was not placed — please try again.',
    }[r.error] || 'Something went wrong. Your order was not placed.');
  }

  /* ---------- customer: confirmation / tracking ---------- */
  function orderCard(o, full) {
    const flow = ['received', 'preparing', 'out', 'delivered'], at = flow.indexOf(o.status);
    return `<section class="card order">
      <div class="order-head"><div><small>Order reference</small><h3>${o.ref}</h3></div>${statusPill(o.status)}</div>
      ${o.status === 'cancelled' ? '' : `<ol class="track">${flow.map((s, i) => `<li class="${i <= at ? 'done' : ''}">${STATUS[s]}</li>`).join('')}</ol>`}
      <ul class="lines plain">${o.items.map(l => `<li><div><b>${l.qty} × ${esc(l.name)}</b></div><b class="num">${money(l.price * l.qty)}</b></li>`).join('')}</ul>
      <div class="total"><span>${o.status === 'cancelled' ? 'Nothing owed' : o.cashCollected ? 'Paid in cash' : 'Cash due on delivery'}</span><b>${money(o.total)}</b></div>
      <dl class="facts"><div><dt>Delivery</dt><dd>${dayLong(o.date)}<br>${esc(o.window)}</dd></div><div><dt>To</dt><dd>${esc(o.name)}<br>${esc(o.address)}, ${esc(o.areaName)}</dd></div>
      ${o.notes ? `<div class="wide"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl>
      ${ui.policy === o.ref ? `<p class="notice closed"><b>This order can't be cancelled.</b> ${esc(S.state.settings.chefName)} has already started preparing it. Orders can only be cancelled before preparation begins. Call ${esc(S.state.settings.chefPhone)} if there's a problem.</p>` : ''}
      <div class="order-actions">${full ? '' : `<a class="link" href="#/order/${o.ref}">View order</a>`}${['received', 'preparing'].includes(o.status) ? `<button class="link danger" data-act="cancel-mine" data-ref="${o.ref}">Cancel order</button>` : ''}</div>
    </section>`;
  }
  function orderPage(ref) {
    const o = S.order(ref);
    if (!o) { view.innerHTML = '<p class="empty">We couldn\'t find that order.</p>'; return; }
    const fresh = o.status === 'received';
    view.innerHTML = `<header class="page-head center">${fresh ? `<p class="script">Thank you, ${esc(o.name.split(' ')[0])}</p><h1>Order confirmed</h1><p>A confirmation was sent by ${esc(o.channel)} to ${S.maskPhone(o.phone)}. Keep your reference handy.</p>` : `<h1>Order ${o.ref}</h1>`}</header>
      ${orderCard(o, true)}
      <p class="center"><a class="btn outline" href="#/orders">My orders</a> <a class="btn outline" href="#/menu">Back to menu</a></p>`;
  }
  function myOrders() {
    const mine = S.state.mine.map(S.order).filter(Boolean);
    view.innerHTML = `<header class="page-head"><h1>My orders</h1><p>Orders placed from this device.</p></header>
      ${mine.length ? mine.map(o => orderCard(o)).join('') : '<p class="empty">You haven\'t placed an order yet.</p><p class="center"><a class="btn" href="#/menu">Browse the menu</a></p>'}`;
  }

  /* ---------- chef: sign in ---------- */
  function chefLogin() {
    const L = S.live;
    view.innerHTML = `<header class="page-head center"><p class="script">Chef's desk</p><h1>Sign in</h1><p>${L.signedIn ? `${esc(L.email)} does not have chef access.` : 'Orders, the prep list and the menu are only visible to the chef.'}</p></header>
      <form class="card form login" id="login-form" novalidate>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" autocapitalize="off" value="${esc(ui.loginEmail || '')}" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        ${ui.loginError ? `<p class="err">${esc(ui.loginError)}</p>` : ''}
        <button class="btn wide" type="submit"${ui.signingIn ? ' disabled' : ''}>${ui.signingIn ? 'Signing in…' : 'Sign in'}</button>
        ${L.signedIn ? '<button type="button" class="link" data-act="sign-out">Sign out</button>' : ''}
      </form>`;
  }

  /* ---------- chef: orders ---------- */
  function chefOrders() {
    const st = S.state, act = st.orders.filter(S.active);
    const open = act.filter(o => o.status !== 'delivered');
    const portions = open.reduce((t, o) => t + o.items.reduce((n, l) => n + l.qty, 0), 0);
    const filters = [['active', 'Active'], ['received', 'Received'], ['preparing', 'Preparing'], ['out', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']];
    const shown = st.orders.filter(o => ui.orderFilter === 'all' ? true : ui.orderFilter === 'active' ? !['delivered', 'cancelled'].includes(o.status) : o.status === ui.orderFilter);
    const label = { preparing: 'Start preparing', out: 'Out for delivery', delivered: 'Delivered · cash collected' };
    view.innerHTML = `<header class="page-head"><h1>Orders</h1><p>${cutoffLine()}</p></header>
      <div class="tiles">
        <div class="tile"><small>Open orders</small><b>${open.length}</b></div>
        <div class="tile"><small>Portions to cook</small><b>${portions}</b></div>
        <div class="tile"><small>Cash to collect</small><b>${money(open.reduce((t, o) => t + o.total, 0))}</b></div>
        <div class="tile"><small>Delivered</small><b>${act.filter(o => o.status === 'delivered').length}</b></div>
      </div>
      <div class="chips">${filters.map(([k, l]) => `<button class="chip${ui.orderFilter === k ? ' on' : ''}" data-act="order-filter" data-k="${k}">${l}</button>`).join('')}</div>
      ${shown.length ? shown.map(o => `<section class="card order">
        <div class="order-head"><div><small>${o.ref} · ${stamp(o.createdAt)}</small><h3>${esc(o.name)}</h3></div>${statusPill(o.status)}</div>
        <p>${o.items.map(l => `${l.qty} × ${esc(l.name)}`).join(' · ')}</p>
        <p class="fine">${dayShort(o.date)}, ${esc(o.window)} · ${esc(o.areaName)} · ${S.maskPhone(o.phone)} · <b>${money(o.total)} cash</b></p>
        <div class="order-actions"><button class="link" data-act="order-detail" data-ref="${o.ref}">Details</button><span class="grow"></span>
          ${NEXT_STATUS[o.status].filter(s => s !== 'cancelled').map(s => `<button class="btn small" data-act="status" data-ref="${o.ref}" data-s="${s}">${label[s]}</button>`).join('')}</div>
      </section>`).join('') : '<p class="empty">No orders here.</p>'}`;
  }
  function cutoffLine() {
    const c = S.cycle();
    return c.open ? `Taking orders until ${cutoffText(c)} for ${list(c.dates.map(dayShort))}.` : `Orders are closed. Next deliveries: ${list(c.dates.map(dayShort))}.`;
  }
  function orderSheet(ref) {
    const o = S.order(ref); if (!o) return;
    ui.sheet = ['order', ref];
    const msgs = S.state.messages.filter(m => m.ref === ref);
    openSheet(`<div class="sheet-head"><div><small>${o.ref}</small><h2>${esc(o.name)}</h2></div><button class="x" data-act="close-sheet" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <div>${statusPill(o.status)}</div>
        <ul class="lines plain">${o.items.map(l => `<li><div><b>${l.qty} × ${esc(l.name)}</b></div><b class="num">${money(l.price * l.qty)}</b></li>`).join('')}</ul>
        <div class="total"><span>${o.cashCollected ? 'Cash collected' : o.status === 'cancelled' ? 'Cancelled — nothing owed' : 'Cash due on delivery'}</span><b>${money(o.total)}</b></div>
        <dl class="facts"><div><dt>Delivery</dt><dd>${dayLong(o.date)}<br>${esc(o.window)}</dd></div>
          <div><dt>Phone</dt><dd>${ui.reveal === ref ? esc(o.phone) : `${S.maskPhone(o.phone)} <button class="link" data-act="reveal" data-ref="${ref}">Show</button>`}</dd></div>
          <div class="wide"><dt>Address</dt><dd>${esc(o.address)}, ${esc(o.areaName)}</dd></div>
          ${o.notes ? `<div class="wide"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl>
        <h3>Status history</h3>
        <ul class="feed">${o.history.map(h => `<li><b>${STATUS[h.status]}${h.by === 'customer' ? ' by customer' : ''}</b><span>${stamp(h.at)}</span></li>`).join('')}</ul>
        <h3>Updates sent</h3>
        <ul class="feed">${msgs.map(m => `<li><b>${esc(m.text)}</b><span>${esc(m.channel)} to ${m.to} · ${stamp(m.at)}</span></li>`).join('') || '<li><span>No updates sent yet.</span></li>'}</ul>
        ${NEXT_STATUS[o.status].includes('cancelled') ? `<button class="link danger" data-act="status" data-ref="${ref}" data-s="cancelled">Cancel this order</button>` : ''}
      </div>`);
  }

  /* ---------- chef: prep list ---------- */
  function chefPrep() {
    const st = S.state;
    const dates = [...new Set(st.orders.filter(S.active).map(o => o.date))].sort();
    if (!dates.includes(ui.prepDate)) ui.prepDate = dates.find(d => d >= S.iso(new Date())) || dates[dates.length - 1] || null;
    const todays = st.orders.filter(o => S.active(o) && o.date === ui.prepDate);
    const totals = {};
    todays.forEach(o => o.items.forEach(l => { totals[l.name] = (totals[l.name] || 0) + l.qty; }));
    view.innerHTML = `<header class="page-head row"><div><h1>Prep list</h1><p>What to cook and where it goes. Cancelled orders are left out.</p></div><button class="btn outline no-print" data-act="print">Print</button></header>
      ${dates.length ? `<div class="chips no-print">${dates.map(d => `<button class="chip${ui.prepDate === d ? ' on' : ''}" data-act="prep-date" data-k="${d}">${dayShort(d)}</button>`).join('')}</div>
      <section class="card"><h3>To cook for ${dayLong(ui.prepDate)}</h3>
        <ul class="lines plain">${Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([n, q]) => `<li><div><b>${esc(n)}</b></div><b class="num">${q} portions</b></li>`).join('')}</ul>
        <div class="total"><span>${todays.length} ${todays.length === 1 ? 'delivery' : 'deliveries'}</span><b>${Object.values(totals).reduce((a, b) => a + b, 0)} portions</b></div>
      </section>
      ${st.settings.windows.map(w => { const os = todays.filter(o => o.window === w); return os.length ? `<div class="rule"><span>${esc(w)}</span></div>${os.map(o => `<section class="card order">
        <div class="order-head"><div><small>${o.ref}</small><h3>${esc(o.name)}</h3></div>${statusPill(o.status)}</div>
        <p><b>${esc(o.address)}, ${esc(o.areaName)}</b> · ${esc(o.phone)}</p>
        ${o.notes ? `<p class="fine">Note: ${esc(o.notes)}</p>` : ''}
        <p>${o.items.map(l => `${l.qty} × ${esc(l.name)}`).join(' · ')}</p>
        <p class="fine">Collect <b>${money(o.total)}</b> in cash</p></section>`).join('')}` : ''; }).join('')}`
      : '<p class="empty">No deliveries booked yet.</p>'}`;
  }

  /* ---------- chef: menu ---------- */
  function chefMenu() {
    const st = S.state;
    view.innerHTML = `<header class="page-head row"><div><h1>Menu</h1><p>Only published meals are visible to customers. A meal needs every detail filled in before it can be published.</p></div><button class="btn" data-act="meal-new">Add meal</button></header>
      ${st.meals.map(m => { const miss = S.mealIssues(m); return `<section class="card order">
        <div class="order-head"><div><small>${esc(m.tag || 'Meal')} · ${money(m.price)}</small><h3>${esc(m.name)}</h3></div>${m.published ? (m.left > 0 ? '<span class="status s-delivered">Published</span>' : '<span class="status s-cancelled">Sold out</span>') : '<span class="status">Draft</span>'}</div>
        <p>${esc(m.desc)}</p>
        ${miss.length ? `<p class="err">Missing: ${esc(miss.join(', '))}.</p>` : ''}
        <div class="order-actions"><span class="fine">Portions left</span><div class="stepper"><button data-act="left" data-id="${m.id}" data-d="-1" aria-label="One fewer portion">−</button><b>${m.left}</b><button data-act="left" data-id="${m.id}" data-d="1" aria-label="One more portion">+</button></div><span class="grow"></span>
          <button class="link" data-act="meal-edit" data-id="${m.id}">Edit</button>
          <button class="btn small${m.published ? ' outline' : ''}" data-act="publish" data-id="${m.id}" data-on="${m.published ? '' : '1'}">${m.published ? 'Unpublish' : 'Publish'}</button></div>
      </section>`; }).join('')}`;
  }
  function mealForm(id) {
    const m = (id && S.meal(id)) || { name: '', tag: '', desc: '', price: '', portion: '', ingredients: '', allergens: '', reheat: '', left: 10 };
    const f = (k, label, attrs = '') => `<label class="field"><span>${label}</span><input name="${k}" value="${esc(m[k])}" ${attrs}></label>`;
    openSheet(`<div class="sheet-head"><h2>${id ? 'Edit meal' : 'New meal'}</h2><button class="x" data-act="close-sheet" aria-label="Close">×</button></div>
      <form class="sheet-body form" id="meal-form" data-id="${id || ''}">
        ${f('name', 'Name', 'required')}${f('desc', 'Short description')}
        <div class="pair">${f('tag', 'Type', 'placeholder="Vegan, Chicken…"')}${f('price', 'Price (€)', 'type="number" min="0" step="0.5" inputmode="decimal"')}</div>
        <div class="pair">${f('portion', 'Portion', 'placeholder="450 g · 1 serving"')}${f('left', 'Portions available', 'type="number" min="0" step="1" inputmode="numeric"')}</div>
        ${f('ingredients', 'Ingredients')}${f('allergens', 'Allergens', 'placeholder="Write None if there are none"')}${f('reheat', 'Reheating instructions')}
        <div class="order-actions">${id ? `<button type="button" class="link danger" data-act="meal-delete" data-id="${id}">Delete meal</button>` : ''}<span class="grow"></span><button class="btn" type="submit">Save</button></div>
      </form>`);
  }

  /* ---------- chef: settings ---------- */
  function chefSettings() {
    const s = S.state.settings;
    const f = (k, label, attrs = '') => `<label class="field"><span>${label}</span><input data-set="${k}" value="${esc(s[k])}" ${attrs}></label>`;
    view.innerHTML = `<header class="page-head"><h1>Settings</h1><p>The rules customers order by. Changes apply straight away.</p></header>
      <section class="card form"><h3>Ordering rules</h3>
        <div class="pair">${f('radiusKm', 'Delivery radius (km)', 'type="number" min="1" max="50"')}${f('minOrder', 'Minimum order (€)', 'type="number" min="0"')}</div>
        <div class="pair"><label class="field"><span>Order cutoff day</span><select data-set="cutoffDay">${DAY_NAMES.map((d, i) => `<option value="${i}"${s.cutoffDay === i ? ' selected' : ''}>${d}</option>`).join('')}</select></label>${f('cutoffTime', 'Cutoff time', 'type="time"')}</div>
        <div class="field"><span>Delivery days</span><div class="chips">${DAY_NAMES.map((d, i) => `<button class="chip${s.deliveryDays.includes(i) ? ' on' : ''}" data-act="del-day" data-k="${i}"${i === s.cutoffDay ? ' disabled' : ''}>${d.slice(0, 3)}</button>`).join('')}</div></div>
        ${f('windowCapacity', 'Deliveries per two-hour window', 'type="number" min="1"')}
        <label class="radio"><input type="checkbox" data-set="forceClosed"${s.forceClosed ? ' checked' : ''}> <span><b>Close orders now</b><small>Stops new orders immediately, as if the cutoff had passed. Use it when you're at capacity.</small></span></label>
      </section>
      <section class="card form"><h3>Contact details shown to customers</h3>
        <div class="pair">${f('chefName', 'Chef name')}${f('base', 'Kitchen location (shown to customers)')}</div><div class="pair">${f('chefPhone', 'Phone / WhatsApp')}${f('chefEmail', 'Email')}</div>
      </section>
      ${S.remote
        ? `<section class="card"><h3>Account</h3><p>Signed in as ${esc(S.live.email)}. Orders and menu changes are shared live with the website.</p><p><button class="btn outline" data-act="sign-out">Sign out</button></p></section>`
        : `<section class="card"><h3>Demo data</h3><p>Puts the sample menu and orders back and clears everything else.</p><p><button class="btn outline" data-act="reset">Reset demo data</button></p></section>`}`;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-act]'); if (!t) return;
    const { act, id, ref, k } = t.dataset, st = S.state;
    if (act === 'close-sheet') closeSheet();
    else if (act === 'qty') S.setQty(id, (st.cart[id] || 0) + Number(t.dataset.d));
    else if (act === 'meal') mealSheet(id);
    else if (act === 'cancel-mine') {
      const r = await S.cancelByCustomer(ref);
      if (r.error === 'policy') { ui.policy = ref; render(); } else if (r.ok) { ui.policy = null; toast(`Order ${ref} cancelled.`); } else toast(r.error);
    }
    else if (act === 'order-filter') { ui.orderFilter = k; render(); }
    else if (act === 'prep-date') { ui.prepDate = k; render(); }
    else if (act === 'print') window.print();
    else if (act === 'order-detail') { ui.reveal = null; orderSheet(ref); }
    else if (act === 'reveal') { ui.reveal = ref; orderSheet(ref); }
    else if (act === 'status') {
      t.disabled = true;
      const r = await S.setStatus(ref, t.dataset.s);
      toast(r.error || `${ref}: ${STATUS[t.dataset.s]}. Customer notified.`);
      if (ui.sheet && ui.sheet[0] === 'order') orderSheet(ref);
    }
    else if (act === 'left') { const r = await S.setLeft(id, S.meal(id).left + Number(t.dataset.d)); if (r.error) toast(r.error); }
    else if (act === 'publish') { const r = await S.setPublished(id, !!t.dataset.on); if (r.error) toast(r.error); }
    else if (act === 'meal-new') mealForm();
    else if (act === 'meal-edit') mealForm(id);
    else if (act === 'meal-delete') { if (confirm('Delete this meal from the menu?')) { const r = await S.deleteMeal(id); if (r.error) toast(r.error); else closeSheet(); } }
    else if (act === 'del-day') { const n = Number(k), d = st.settings.deliveryDays; S.saveSettings({ deliveryDays: d.includes(n) ? d.filter(x => x !== n) : [...d, n] }); }
    else if (act === 'sign-out') { await S.signOut(); toast('Signed out.'); }
    else if (act === 'reset') { if (confirm('Reset all demo data? Orders and menu changes will be lost.')) { S.reset(); toast('Demo data reset.'); } }
  });

  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.f) { S.state.draft[t.dataset.f] = t.value; S.save(true); }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.f && 'rerender' in t.dataset) render();
    else if (t.dataset.act === 'area-check') { ui.areaCheck = t.value; render(); }
    else if (t.dataset.set) S.saveSettings({ [t.dataset.set]: t.type === 'checkbox' ? t.checked : t.value }).then(r => { if (r.error) toast(r.error); });
  });
  document.addEventListener('submit', ev => {
    ev.preventDefault();
    if (ev.target.id === 'checkout-form') submitOrder();
    else if (ev.target.id === 'login-form') {
      const f = new FormData(ev.target);
      ui.loginEmail = f.get('email'); ui.loginError = null; ui.signingIn = true; render();
      S.signIn(f.get('email'), f.get('password')).then(r => { ui.signingIn = false; ui.loginError = r.error || null; render(); });
    }
    else if (ev.target.id === 'meal-form') {
      const data = Object.fromEntries(new FormData(ev.target)); data.id = ev.target.dataset.id;
      if (!data.name.trim()) { toast('Give the meal a name.'); return; }
      S.saveMeal(data).then(r => { if (r.error) toast(r.error); else { closeSheet(); toast('Meal saved.'); } });
    }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });

  /* Inside the Android app this is the chef's tool: it opens on the Chef's desk and the back button behaves like a phone app. */
  const native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  /* chef.html is the same chef's tool for iPhone: opened from Safari and added to the Home Screen. */
  if (native || window.TT_CHEF) {
    document.documentElement.classList.add('native');
    if (!location.hash || location.hash === '#/') location.hash = '#/chef';
  }
  if (native) {
    native.addListener('backButton', () => {
      if (sheet.classList.contains('on')) closeSheet();
      else if (route !== 'chef') location.hash = '#/chef';
      else native.exitApp();
    });
  }

  /* Keeps the pages available offline once they have been opened over https. */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  S.live.onNewOrder = o => toast(`New order ${o.ref} from ${o.name}`);

  S.subscribe(render);
  window.addEventListener('hashchange', () => { closeSheet(); ui.tried = false; ui.policy = null; render(); if (/^#\/(checkout|order)/.test(location.hash)) { S.refreshCounts(); S.refreshOrders(); } });
  render();
})();
