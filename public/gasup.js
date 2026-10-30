"use strict";
/* =========================================================
   GasUp — cooking-gas refill shop app (single-file, localStorage)
   ========================================================= */
const DB_KEY = "gasup-db-v1";
const DAY = 86400000;
let SHOP_NAME = "GasUp";
let SHOP_ADDRESS = "No. 50 Efosa Close, off Aerodrome Close, Benin City, Edo State, Nigeria";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ngnFormatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const naira = n => ngnFormatter.format(Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);
const fmtDT = ts => new Date(ts).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"});
function ago(ts){
  const m = Math.round((Date.now()-ts)/60000);
  if(m < 60) return m + "m ago";
  const h = Math.round(m/60);
  if(h < 24) return h + "h ago";
  return Math.round(h/24) + "d ago";
}

/* ---------------- store ---------------- */
let db = null;
function load(){
  try{ const raw = localStorage.getItem(DB_KEY); if(raw) return JSON.parse(raw); }catch(e){}
  return null;
}
function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function seed(){
  const now = Date.now();
  const cyl = [
    {id:"c3",  size:3,    ppk:1250},
    {id:"c6",  size:6,    ppk:1230},
    {id:"c12", size:12.5, ppk:1200},
    {id:"c25", size:25,   ppk:1180},
  ];
  const unit = s => Math.round(s * cyl.find(c=>c.size===s).ppk);
  const settings = {
    deliveryFee:1500, defaultRefillDays:28, staffPin:"1234", paystackKey:"",
    shopAddress:SHOP_ADDRESS,
    shopPhone:"0800 226 4357",
  };
  let n = 1042;
  const O = (o) => ({ id:"GU-"+(n++), createdAt:o.at, notes:"", ...o });
  const paid = (method, at, amount) => ({ status:"paid", method, ref:"PAY-"+Math.random().toString(36).slice(2,8).toUpperCase(), amount, at });
  const orders = [
    O({customerName:"Amina Yusuf", customerPhone:"0803 111 2233", customerEmail:"amina@example.com", size:12.5, qty:1, type:"pickup", address:"", status:"done", unitPrice:unit(12.5), deliveryFee:0, total:unit(12.5), payment:paid("card", now-40*DAY, unit(12.5)), at:now-40*DAY}),
    O({customerName:"Amina Yusuf", customerPhone:"0803 111 2233", customerEmail:"amina@example.com", size:12.5, qty:1, type:"pickup", address:"", status:"done", unitPrice:unit(12.5), deliveryFee:0, total:unit(12.5), payment:paid("transfer", now-19*DAY, unit(12.5)), at:now-19*DAY}),
    O({customerName:"Chidi Okafor", customerPhone:"0806 222 3344", customerEmail:"chidi@example.com", size:6, qty:1, type:"delivery", address:"5 Adebayo St, Yaba", status:"done", unitPrice:unit(6), deliveryFee:1500, total:unit(6)+1500, payment:paid("card", now-28*DAY, unit(6)+1500), at:now-28*DAY}),
    O({customerName:"Bola Ade", customerPhone:"0810 333 4455", customerEmail:"bola@example.com", size:25, qty:1, type:"delivery", address:"77 Herbert Macaulay Way", status:"preparing", unitPrice:unit(25), deliveryFee:1500, total:unit(25)+1500, payment:{status:"unpaid", method:"on_delivery", ref:"", amount:0, at:0}, at:now-1*DAY}),
    O({customerName:"Tayo Adesanya", customerPhone:"0805 444 5566", customerEmail:"tayo@example.com", size:3, qty:2, type:"pickup", address:"", status:"ready", unitPrice:unit(3), deliveryFee:0, total:unit(3)*2, payment:paid("ussd", now-3*3600e3, unit(3)*2), at:now-3*3600e3}),
    O({customerName:"Musa Danjuma", customerPhone:"0802 555 6677", customerEmail:"musa@example.com", size:12.5, qty:1, type:"delivery", address:"12 Marina Rd, Lagos Island", status:"out", unitPrice:unit(12.5), deliveryFee:1500, total:unit(12.5)+1500, payment:paid("transfer", now-3600e3, unit(12.5)+1500), at:now-3600e3}),
    O({customerName:"Fatima Bello", customerPhone:"0809 666 7788", customerEmail:"fatima@example.com", size:6, qty:1, type:"pickup", address:"", status:"new", unitPrice:unit(6), deliveryFee:0, total:unit(6), payment:paid("card", now-20*60000, unit(6)), at:now-20*60000}),
  ];
  const payments = orders.filter(o=>o.payment.status==="paid").map(o=>({
    id:"py"+o.id+o.at, orderId:o.id, method:o.payment.method, amount:o.payment.amount, at:o.payment.at
  }));
  db = { v:1, counter:n, cylinders:cyl, settings, orders, payments, emails:[], manualRefillDays:{} };
  orderEmail(orders[4], "ready", true); // Tayo — ready-for-pickup email
  orderEmail(orders[5], "out",   true); // Musa — out-for-delivery email
  save();
}

/* ---------------- domain helpers ---------------- */
const cylBySize = s => db.cylinders.find(c => Math.abs(c.size - s) < .001);
const unitPrice = s => { const cylinder=cylBySize(s); return cylinder ? Math.round(cylinder.size * cylinder.ppk) : 0; };
const STATUS_LABEL = {new:"New", preparing:"Preparing", ready:"Ready for pickup", out:"Out for delivery", done:"Completed", cancelled:"Cancelled"};
const METHOD_LABEL = {paystack:"Paystack", card:"Card", transfer:"Bank transfer", ussd:"USSD", on_delivery:"Pay on delivery", cash:"Cash at shop"};

function nextOrderNo(){ return "GU-" + (db.counter++); }

function createOrder(fields, payInfo){
  const o = {
    id: nextOrderNo(),
    createdAt: Date.now(),
    notes: "",
    ...fields,
    payment: payInfo,
  };
  db.orders.unshift(o);
  if(payInfo.status === "paid"){
    db.payments.unshift({id:"py"+o.id+Date.now(), orderId:o.id, method:payInfo.method, amount:payInfo.amount, at:payInfo.at});
  }
  save();
  return o;
}

function setPaid(o, method){
  const p = {status:"paid", method, ref:"PAY-"+Math.random().toString(36).slice(2,8).toUpperCase(), amount:o.total, at:Date.now()};
  o.payment = p;
  db.payments.unshift({id:"py"+o.id+Date.now(), orderId:o.id, method, amount:o.total, at:p.at});
  save();
  notifyPaid(o);
}

/* ---------------- server-side Make automation ---------------- */
function makeConnected(){ return !!window.gasupConfig?.makeConfigured; }
function mailChannel(){ return "make"; }
function makePayload(e){
  const o = e.orderId ? db.orders.find(x => x.id === e.orderId) : null;
  return {
    type: ({ready:"READY", reminder:"REMINDER", paid:"PAID", out:"OUT_FOR_DELIVERY", test:"TEST"}[e.event] || "READY"),
    order_id: e.orderId || "", customer_name: e.to_name || "", customer_email: e.to_email,
    customer_phone: o ? o.customerPhone : "", size_kg: o ? o.size : undefined,
    quantity: o ? o.qty : undefined, fulfilment: o ? o.type.toUpperCase() : undefined,
    delivery_address: o ? (o.address || undefined) : undefined,
    shop_name: SHOP_NAME, shop_address: db.settings.shopAddress || SHOP_ADDRESS,
    subject: e.subject, message: e.body,
  };
}
async function deliverEmail(e, {quiet} = {}){
  if(!e.to_email || e.status !== "pending") return;
  e.status = "sending"; save();
  try {
    const response = await fetch("/api/automation", {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(makePayload(e)),
    });
    const result = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(result.error || `Automation failed (${response.status})`);
    e.status = "sent"; e.sentAt = Date.now(); e.error = "";
    if(!quiet) toast(`✅ Email ${e.via === "make" ? "triggered via Make to" : "delivered to"} ${e.to_name || e.to_email}`, "ok");
  } catch(err){
    const why = err && (err.text || err.message) || "unknown error";
    e.status = "failed"; e.error = why;
    toast(`⚠ Could not deliver to ${e.to_email}: ${why}`, "warn");
  }
  save();
  if(typeof view !== "undefined" && view === "staff") { render(); refreshServerAutomationLogs(); }
}
function pushEmail(o, {to, subject, body, orderId, event, quiet, forceVia}){
  const via = forceVia || mailChannel();
  const entry = {
    id:"em"+Date.now()+Math.random().toString(36).slice(2,5),
    to, to_email: /@/.test(to) ? to : "", to_name: o ? (o.customerName || "") : "",
    subject, body, orderId: orderId || "", at: Date.now(), event: event || "",
    via: via || "", viaLabel: via === "make" ? "Make.com" : "",
    status: to && /@/.test(to) ? (via ? "pending" : "queued") : "no-email",
    error: "",
  };
  db.emails.unshift(entry);
  if(entry.status === "pending") deliverEmail(entry, {quiet});
  else save();
  return entry;
}
function orderEmail(o, kind, silent){
  let subject, body;
  if(kind === "ready"){
    subject = `Your gas is ready for pickup — GasUp order ${o.id}`;
    body = `Hello ${o.customerName},\n\nGood news! Your gas refill is ready for collection.\n\nOrder ${o.id}\n${o.qty} × ${o.size} kg cylinder\nTotal: ${naira(o.total)} — ${o.payment.status === "paid" ? "already paid, nothing more to pay" : "payment due on collection"}\nPickup: ${db.settings.shopAddress}\n\nOur team is holding your cylinder at the front desk — just mention your order reference.\n\nQuestions? We're a call away on ${db.settings.shopPhone}.\n\nThank you for choosing GasUp.\n\nBest regards,\nGasUp Team`;
  } else {
    subject = `Your gas order is on the way — ${o.id}`;
    body = `Hello ${o.customerName},\n\nYour refill is on the way! We'll reach you shortly.\n\nOrder: ${o.id}\nItems: ${o.qty} × ${o.size} kg cylinder\nDelivery to: ${o.address || "your address on file"}\nAmount: ${naira(o.total)} (${o.payment.status === "paid" ? "paid" : "pay on delivery"})\n\nGasUp Team`;
  }
  const e = pushEmail(o, {to:o.customerEmail || "customer (phone/SMS)", subject, body, orderId:o.id, event:kind});
  if(!silent && e.status === "queued") toast(`📧 ${kind === "ready" ? "Ready-for-pickup" : "Delivery"} email written to ${e.to_email} — configure MAKE_WEBHOOK_URL on the server`, "warn");
}
/* fires the moment any payment succeeds (online or staff-collected) */
function notifyPaid(o, opts = {}){
  if(!o || !/@/.test(o.customerEmail || "")) return;
  pushEmail(o, {
    to: o.customerEmail,
    subject: `Payment received — GasUp order ${o.id}`,
    body: `Hello ${o.customerName},\n\nWe received your payment of ${naira(o.total)} for order ${o.id}.\n\n✓ Your refill is being prepared now.\n${o.type === "delivery" ? "We'll bring it to " + (o.address || "your address") + "." : "Collect it at " + db.settings.shopAddress + "."}\nWe'll email you the moment it's ready for pickup.\n\nQuestions? Call ${db.settings.shopPhone}.\n\nGasUp Team`,
    orderId: o.id, event: "paid", quiet: !!opts.quiet,
  });
}

/* ---------------- reminders (special feature) ---------------- */
function computeReminders(){
  const map = new Map();
  db.orders.forEach(o => {
    if(o.status !== "done") return;
    const key = o.customerPhone + "|" + o.size;
    if(!map.has(key)) map.set(key, {phone:o.customerPhone, name:o.customerName, email:o.customerEmail || "", size:o.size, dates:[]});
    map.get(key).dates.push(o.completedAt || o.createdAt);
  });
  const out = [];
  map.forEach(r => {
    r.dates.sort((a,b)=>a-b);
    const last = r.dates[r.dates.length-1];
    const manualEstimate = db.manualRefillDays?.[r.phone + "|" + r.size];
    let avg = manualEstimate || db.settings.defaultRefillDays;
    if(!manualEstimate && r.dates.length >= 2){
      let sum = 0;
      for(let i=1;i<r.dates.length;i++) sum += (r.dates[i]-r.dates[i-1])/DAY;
      avg = sum/(r.dates.length-1);
    }
    avg = Math.min(Math.max(avg, 7), 90); // sanity clamp
    const daysLeft = Math.round((last + avg*DAY - Date.now())/DAY);
    out.push({...r, last, avg:Math.round(avg), daysLeft, needsManualEstimate:r.dates.length < 2 && !manualEstimate});
  });
  out.sort((a,b)=>a.daysLeft-b.daysLeft);
  return out;
}
function dueBadge(d){
  if(d < 0) return `<span class="pill b-over">⚠ Overdue by ${-d}d</span>`;
  if(d === 0) return `<span class="pill b-due">Refill today</span>`;
  if(d <= 3) return `<span class="pill b-due">Due in ${d}d</span>`;
  return `<span class="pill b-ok">OK · in ${d}d</span>`;
}

/* ---------------- transient UI state ---------------- */
let view = "customer";
let staffTab = "board";
let draft = { size:12.5, qty:1, type:"pickup", name:"", phone:"", email:"", address:"" };
let myPhone = localStorage.getItem("gasup-my-phone") || "";
let expandedEmail = null;
let staffOk = sessionStorage.getItem("gasup-staff-ok") === "1";
let currentUser = null;
let authMode = 'login';
let checkoutAfterAuth = false;
let resetToken = '';

function toast(msg, cls){
  const el = document.createElement("div");
  el.className = "toast " + (cls||"");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

/* ---------------- modals ---------------- */
function openModal(inner){
  document.getElementById("modal-root").innerHTML =
    `<div class="overlay" data-action="overlay-close"><div class="modal" data-action="noop"><div class="mc" id="modal-inner">${inner}</div></div></div>`;
}
function closeModal(){ document.getElementById("modal-root").innerHTML = ""; }

/* =========================================================
   VIEWS
   ========================================================= */
function render(){
  updateAuthButton();
  document.getElementById("nav-cust").classList.toggle("on", view === "customer");
  document.getElementById("nav-staff").classList.toggle("on", view === "staff");
  const app = document.getElementById("app");
  app.innerHTML = (view === "customer") ? vCustomer() : vStaff();
}

function updateAuthButton(){
  const button=document.getElementById('nav-auth');
  if(!button) return;
  button.textContent=currentUser ? `Sign out · ${currentUser.name.split(' ')[0]}` : 'Sign in';
  button.dataset.action=currentUser ? 'auth-logout' : 'auth-open';
}

function openAuthModal(mode='login'){
  authMode=mode;
  const staff=mode==='staff', register=mode==='register', resetRequest=mode==='reset-request', resetComplete=mode==='reset-complete';
  openModal(`<div class="mh" style="padding:16px 0 0"><h3>${staff?'Staff sign-in':register?'Create your GasUp account':resetRequest?'Reset your password':resetComplete?'Choose a new password':'Sign in to GasUp'}</h3><button class="x" data-action="close-modal">×</button></div>
    ${register?`<div class="field"><label>Full name</label><input class="input" id="auth-name" value="${esc(draft.name)}" autocomplete="name"></div><div class="field"><label>Phone</label><input class="input" id="auth-phone" value="${esc(draft.phone)}" autocomplete="tel"></div>`:''}
    ${staff||resetComplete?'':`<div class="field"><label>Email</label><input class="input" id="auth-email" type="email" value="${esc(draft.email || currentUser?.email || '')}" autocomplete="email"></div>`}
    ${resetRequest?'':`<div class="field"><label>${resetComplete?'New password':'Password'}${register||resetComplete?' (at least 10 characters)':''}</label><input class="input" id="auth-password" type="password" autocomplete="${register||resetComplete?'new-password':'current-password'}"></div>`}
    <div class="err" id="auth-error"></div><button class="btn primary block" style="margin-top:10px" data-action="auth-submit">${staff?'Sign in as staff':register?'Create account':resetRequest?'Send reset link':resetComplete?'Save new password':'Sign in'}</button>
    ${staff||resetRequest||resetComplete?'':`${!register?`<button class="btn ghost block" style="margin-top:7px" data-action="auth-reset">Forgot password?</button>`:''}<button class="btn ghost block" style="margin-top:7px" data-action="auth-switch">${register?'Already have an account? Sign in':'New to GasUp? Create an account'}</button>`}`);
  document.getElementById('auth-email')?.focus();
}

let staffRefreshBusy = false;
async function refreshServerOrders(){
  if(view !== 'staff' || currentUser?.role!=='STAFF' || staffRefreshBusy) return;
  staffRefreshBusy = true;
  try {
    const response = await fetch('/api/orders');
    if(!response.ok) return;
    const {orders=[]} = await response.json();
    const local = new Map(db.orders.map(order=>[order.id,order]));
    for(const order of orders) local.set(order.id,{...(local.get(order.id)||{}),...order});
    db.orders = [...local.values()].sort((a,b)=>b.createdAt-a.createdAt);
    save();
    render();
  } catch {} finally { staffRefreshBusy = false; }
}
async function refreshCustomerOrders(){
  if(currentUser?.role!=='CUSTOMER') return;
  try{
    const response=await fetch('/api/orders');
    if(!response.ok) return;
    const {orders=[]}=await response.json();
    const local=new Map(db.orders.map(order=>[order.id,order]));
    for(const order of orders)local.set(order.id,{...(local.get(order.id)||{}),...order});
    db.orders=[...local.values()].sort((a,b)=>b.createdAt-a.createdAt);
    const estimateResponse=await fetch('/api/customer/reminder');
    if(estimateResponse.ok){
      const {estimates=[]}=await estimateResponse.json();
      db.manualRefillDays ||= {};
      for(const estimate of estimates) db.manualRefillDays[myPhone + "|" + estimate.sizeKg]=estimate.days;
    }
    save();render();
  }catch{}
}
let automationRefreshBusy = false;
async function refreshServerAutomationLogs(){
  if(view!=='staff' || currentUser?.role!=='STAFF' || automationRefreshBusy) return;
  automationRefreshBusy = true;
  try {
    const response = await fetch('/api/automation');
    if(!response.ok) return;
    const {logs=[]} = await response.json();
    if(JSON.stringify(logs)!==JSON.stringify(db.serverAutomationLogs||[])){
      db.serverAutomationLogs=logs;
      if(staffTab==='emails') render();
    }
  } catch {} finally { automationRefreshBusy=false; }
}

/* ---------------- customer ---------------- */
function remindStrip(){
  if(!myPhone) return "";
  const rems = computeReminders().filter(r => r.phone.replace(/\D/g,"") === myPhone.replace(/\D/g,""));
  if(!rems.length) return "";
  return `
  <div class="card pad" style="margin-top:16px;border-color:#f4c98f;background:#fffaf3">
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
      <span style="font-size:20px">🔔</span>
      <div><b>Smart refill reminders</b><div class="fine">Based on how quickly you use each cylinder</div></div>
    </div>
    <div class="rem-strip">
      ${rems.slice(0,3).map(r => `
        <div class="rem">
          <div class="ic">🛢️</div>
          <div class="t"><b>${r.size} kg cylinder</b><span>Last refill ${ago(r.last)} · ${r.daysLeft < 0 ? `overdue by ${-r.daysLeft} days` : `likely to run out in ${r.daysLeft} days`}</span>
            ${r.needsManualEstimate ? `<div class="manual-estimate"><label class="fine" for="manual-days-${r.size}">How many days does it usually last?</label><div class="manual-estimate-row"><input class="input" id="manual-days-${r.size}" type="number" min="7" max="90" placeholder="e.g. 28"><button class="btn small" data-action="save-manual-days" data-size="${r.size}">Save</button></div></div>` : ""}
          </div>
          <div style="text-align:right;display:grid;gap:6px;justify-items:end">
            ${dueBadge(r.daysLeft)}
            <button class="btn small primary" data-action="reorder" data-size="${r.size}">Reorder</button>
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

function vCustomer(){
  const c = db.cylinders.filter(x=>x.active!==false);
  if(c.length && !c.some(x=>Math.abs(x.size-draft.size)<.001)) draft.size=c[0].size;
  const sizeCards = c.map(x => `
    <button class="cyl ${draft.size === x.size ? "on" : ""}" data-action="pick-size" data-size="${x.size}">
      <div class="sz">${x.size} kg</div><div class="kg">cylinder</div>
      <div class="pr">${naira(unitPrice(x.size))}<span class="fine"> · ${naira(x.ppk)}/kg</span></div>
    </button>`).join("");
  const mine = myPhone ? db.orders.filter(o => o.customerPhone.replace(/\D/g,"") === myPhone.replace(/\D/g,"")) : [];
  const payBtn = c.length ? `<button class="btn primary block" id="place-btn" data-action="place-order">Order refill — pay ${naira(orderTotal())}</button>` : `<button class="btn primary block" disabled>No cylinder sizes available</button>`;

  return `
  <section class="landing-hero">
    <div class="hero-copy">
      <span class="eyebrow">Reliable refills in Benin City</span>
      <h1>Gas when you need it.<br><span>Without the queue.</span></h1>
      <p>Order your cooking gas online, pay securely, and pick it up when it’s ready. Delivery is available too.</p>
      <div class="hero-actions">
        <button class="btn primary" data-action="scroll-order">Order a refill</button>
        <button class="btn" data-action="nav-view" data-view="staff">Staff login</button>
      </div>
    </div>
    <div class="hero-art"><img src="/images/gasup-hero.jpg" alt="GasUp: fueling Benin City, reliably" fetchpriority="high" onerror="this.style.display='none';this.parentElement.classList.add('image-missing')"></div>
  </section>

  ${remindStrip()}

  <div class="grid2" style="margin-top:20px">
    <div class="card pad" id="order-section">
      <h2 style="font-size:17px">Order a refill</h2>
      <div class="sec" style="margin:12px 0 8px"><h2 style="font-size:13.5px;color:var(--slate)">1 · Choose cylinder size</h2></div>
      <div class="cyls">${sizeCards || `<div class="empty">No cylinder sizes are currently available.</div>`}</div>

      <div class="qtyline">
        <span style="font-weight:700;font-size:13.5px;color:var(--slate)">Quantity</span>
        <button class="qbtn" data-action="qty" data-d="-1">−</button>
        <span class="qv">${draft.qty}</span>
        <button class="qbtn" data-action="qty" data-d="1">+</button>
        <span class="fine">how many cylinders to refill</span>
      </div>

      <div class="sec" style="margin:12px 0 8px"><h2 style="font-size:13.5px;color:var(--slate)">2 · Pickup or delivery</h2></div>
      <div class="radio-row">
        <label class="radio-card ${draft.type==="pickup"?"on":""}">
          <input type="radio" name="otype" value="pickup" data-draft="type" ${draft.type==="pickup"?"checked":""}>
          <span><span class="t">🛍️ Pickup</span><br><span class="s">Free · collect at shop</span></span>
        </label>
        <label class="radio-card ${draft.type==="delivery"?"on":""}">
          <input type="radio" name="otype" value="delivery" data-draft="type" ${draft.type==="delivery"?"checked":""}>
          <span><span class="t">🛵 Delivery</span><br><span class="s">+ ${naira(db.settings.deliveryFee)} to your door</span></span>
        </label>
      </div>

      <div class="sec" style="margin:14px 0 8px"><h2 style="font-size:13.5px;color:var(--slate)">3 · Your details</h2></div>
      <div class="row2">
        <div class="field"><label>Full name</label><input class="input" id="f-name" data-user="name" value="${esc(draft.name)}" placeholder="Amina Yusuf"></div>
        <div class="field"><label>Phone number</label><input class="input" id="f-phone" data-user="phone" value="${esc(draft.phone)}" placeholder="0803 000 0000"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Email <span class="fine">(gets your “ready for pickup” email)</span></label><input class="input" id="f-email" data-user="email" value="${esc(draft.email)}" placeholder="you@example.com"></div>
        <div class="field"><label>Padlock / cylinder note <span class="fine">(optional)</span></label><input class="input" placeholder="e.g. bring my regulator"></div>
      </div>
      ${draft.type === "delivery" ? `<div class="field"><label>Delivery address</label><input class="input" id="f-address" data-user="address" value="${esc(draft.address)}" placeholder="Street, area, landmark"></div>` : ""}
      ${payBtn}
    </div>

    <div>
      <div class="card pad">
        <h2 style="font-size:17px; margin-bottom:4px">My orders</h2>
        ${myPhone ? `<p class="fine" style="margin:0 0 10px">Showing orders for <b>${esc(myPhone)}</b></p>` : `<p class="fine" style="margin:0 0 10px">Enter the phone number you used to order.</p>`}
        <div class="row2">
          <input class="input" id="mine-phone" placeholder="0803 000 0000" value="${esc(myPhone)}">
          <button class="btn" data-action="find-mine">Find my orders</button>
        </div>
        <div style="margin-top:12px;display:grid;gap:8px">
          ${mine.length ? mine.slice(0,8).map(orderRow).join("") : `<div class="empty">No orders yet for this number.</div>`}
        </div>
      </div>
      <div class="card pad" style="margin-top:14px">
        <b>🛍️ Pickup</b><div class="fine">Collect at ${esc(db.settings.shopAddress)}. We keep your cylinder ready and email you.</div>
        <hr style="border:0;border-top:1px dashed var(--line);margin:10px 0">
        <b>🛵 Delivery</b><div class="fine"> Bringing gas to your door in town — fee is ${naira(db.settings.deliveryFee)}.</div>
      </div>
    </div>
  </div>

  <section class="how-section" aria-labelledby="how-title">
    <div class="section-heading"><span class="eyebrow">Simple from start to finish</span><h2 id="how-title">How it works</h2></div>
    <div class="steps-grid">
      <article class="step-card"><span class="step-number">01</span><h3>Order</h3><p>Choose your cylinder size and pickup or delivery.</p></article>
      <article class="step-card"><span class="step-number">02</span><h3>Pay securely</h3><p>Complete your payment online in a few taps.</p></article>
      <article class="step-card"><span class="step-number">03</span><h3>Get the ready email</h3><p>We’ll let you know as soon as your refill is ready.</p></article>
      <article class="step-card"><span class="step-number">04</span><h3>Pick up without queuing</h3><p>Come straight to the shop and collect your order.</p></article>
    </div>
  </section>

  <section class="find-us" aria-labelledby="find-title"><div><span class="eyebrow">Your local refill shop</span><h2 id="find-title">Find us</h2><p>${esc(SHOP_ADDRESS)}</p></div><a class="btn" href="https://maps.google.com/?q=${encodeURIComponent(SHOP_ADDRESS)}" target="_blank" rel="noreferrer">Open in Maps ↗</a></section>
  <footer class="site-footer"><span>© ${new Date().getFullYear()} GasUp</span><span>${esc(SHOP_ADDRESS)}</span><span>Fueling Benin City, Reliably.</span></footer>`;
}

function orderRow(o){
  return `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:9px 11px">
    <div>
      <b style="font-size:13.5px">${o.id}</b> · ${o.size}kg × ${o.qty}
      <div class="fine">${naira(o.total)} · ${ago(o.createdAt)}${o.type === "pickup" ? " · Pick up at: " + esc(SHOP_ADDRESS) : " · Delivery: " + esc(o.address || "")}</div>
    </div>
    <div style="display:grid;gap:4px;justify-items:end">
      <span class="pill ${STATUS_CLASS[o.status]}">${STATUS_LABEL[o.status]}</span>
      ${o.payment.status === "paid" ? `<span class="pill b-paid">PAID</span>` : `<span class="pill b-unpaid">UNPAID</span>`}
    </div>
  </div>`;
}
const STATUS_CLASS = {new:"p new", preparing:"p preparing", ready:"p ready", out:"p out", done:"p done", cancelled:"p cancelled"};

function orderTotal(){
  const unit = unitPrice(draft.size);
  return unit*draft.qty + (draft.type === "delivery" ? db.settings.deliveryFee : 0);
}

/* ---------------- customer payment flow ---------------- */
function paystackPk(){ return db.settings.paystackKey || ""; }

function openPayModal(){
  const total = orderTotal();
  const pk = paystackPk();
  const onlineMethods = pk
    ? [`<label class="method on" data-action="pick-method" data-m="paystack">
          <input type="radio" name="pm" value="paystack" checked>
          <span>Pay online <span class="fine">card · bank · USSD · via Paystack</span></span>
        </label>`]
    : [`<p class="fine">Online checkout is unavailable until matching Paystack test keys are configured by the shop.</p>`];
  openModal(`
    <div class="mh" style="padding:16px 0 0"><h3>Checkout</h3><button class="x" data-action="close-modal">✕</button></div>
    <div class="paysum">
      <div class="l"><span>Refill — ${draft.size}kg × ${draft.qty}</span><span>${naira(unitPrice(draft.size)*draft.qty)}</span></div>
      ${draft.type === "delivery" ? `<div class="l"><span>Delivery</span><span>${naira(db.settings.deliveryFee)}</span></div>` : `<div class="l"><span>Pickup at shop</span><span>Free</span></div>`}
      <div class="l" style="font-weight:800;color:var(--ink)"><span>Total</span><span style="color:var(--o)">${naira(total)}</span></div>
    </div>
    <div class="methods" id="methods">
      ${onlineMethods.join("")}
    </div>
    <button class="btn primary block" id="pay-btn" data-action="do-pay" ${!pk ? "disabled" : ""}>${pk ? `Pay ${naira(total)} with Paystack` : "Paystack unavailable"}</button>
  `);
}

function buildOrderFields(total){
  return {
    customerName:draft.name.trim(), customerPhone:draft.phone.trim(), customerEmail:draft.email.trim(),
    size:draft.size, qty:draft.qty, type:draft.type, address:draft.type === "delivery" ? draft.address.trim() : "",
    status:"new", unitPrice:unitPrice(draft.size), deliveryFee:draft.type === "delivery" ? db.settings.deliveryFee : 0, total,
  };
}
function lockCheckout(){
  const btn = document.getElementById("pay-btn");
  btn.disabled = true;
  btn.textContent = "Processing…";
  document.getElementById("methods").style.pointerEvents = "none";
  document.getElementById("modal-inner").insertAdjacentHTML("beforeend", `<div class="spinner"></div><p class="fine" style="text-align:center" id="pay-note">Processing payment…</p>`);
}
function showSuccess(o, fields, paidNow){
  myPhone = fields.customerPhone;
  localStorage.setItem("gasup-my-phone", myPhone);
  document.getElementById("modal-inner").innerHTML = `
    <div class="success">
      <div class="big">✓</div>
      <h3>${paidNow ? "Payment successful" : "Order placed!"}</h3>
      <div class="oid">${o.id}</div>
      <p class="fine" style="margin:6px 0 14px">${draft.size}kg × ${draft.qty} · ${draft.type === "pickup" ? "Pick up at: " + esc(SHOP_ADDRESS) : "Delivery to " + esc((draft.address||"").slice(0,40))} · ${naira(o.total)} ${paidNow ? "paid" : "pay on delivery"}</p>
      <p style="font-size:13.5px;margin:0 0 14px">📦 Your order is on the staff board.<br>We'll <b>email you when it's ready for pickup</b> — and remind you before your gas runs out next time.</p>
      <button class="btn primary block" data-action="close-modal">Done</button>
    </div>`;
  toast(`✅ Order ${o.id} placed — staff notified`, "ok");
  render();
}

function doPay(){
  const total = orderTotal();
  if(!paystackPk()) { toast("Paystack test checkout is not configured yet", "warn"); return; }
  startPaystack(total);
}

/* ---------------- server-verified Paystack checkout ---------------- */
async function startPaystack(total){
  lockCheckout();
  const fields = buildOrderFields(total);
  try {
    const orderResponse = await fetch('/api/orders', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({customerName:fields.customerName, customerEmail:fields.customerEmail,
        customerPhone:fields.customerPhone, sizeKg:draft.size, quantity:draft.qty,
        fulfilment:draft.type.toUpperCase(), deliveryAddress:fields.address}),
    });
    const order = await orderResponse.json().catch(() => ({}));
    if(!orderResponse.ok) throw new Error(order.error || 'Could not save the order');

    const paymentResponse = await fetch('/api/paystack/initialize', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({orderId:order.id}),
    });
    const payment = await paymentResponse.json().catch(() => ({}));
    if(!paymentResponse.ok || !payment.authorizationUrl) throw new Error(payment.error || 'Could not start Paystack checkout');

    const localOrder = createOrder({...fields, id:order.id, total:order.totalPrice,
      deliveryFee:order.deliveryFee, unitPrice:Math.round((order.totalPrice-order.deliveryFee)/draft.qty)},
      {status:'pending', method:'paystack', ref:payment.reference, amount:order.totalPrice, at:0});
    myPhone = localOrder.customerPhone;
    localStorage.setItem('gasup-my-phone', myPhone);
    window.location.assign(payment.authorizationUrl);
  } catch(error) {
    openPayModal();
    toast(`Payment could not start: ${error instanceof Error ? error.message : 'Try again'}`, 'warn');
  }
}

/* ---------------- staff ---------------- */
function vStaff(){
  const tabs = [
    ["board","🗂 Order board"],["reminders","🔔 Refill reminders"],["emails","📧 Emails"],["payments","💳 Payments"],["pricing","⚙️ Products & settings"]
  ];
  return `
  <div class="hero"><div>
    <span class="eyebrow">Staff console</span>
    <h1>Shop dashboard</h1>
    <p>Move orders across the board. Marking an order <b>ready</b> (or out for delivery) automatically emails the customer.</p>
  </div><button class="btn" data-action="walkin-open">＋ Walk-in order</button></div>

  <div class="tabs" style="margin-top:18px">
    ${tabs.map(([k,l]) => `<button class="${staffTab===k?"on":""}" data-action="staff-tab" data-tab="${k}">${l}</button>`).join("")}
  </div>
  <div id="staff-panel">${({board:sBoard, reminders:sReminders, emails:sEmails, payments:sPayments, pricing:sPricing}[staffTab])()}</div>
  <footer class="site-footer"><span>GasUp staff</span><span>${esc(SHOP_ADDRESS)}</span></footer>`;
}

function sBoard(){
  const today = new Date().toDateString();
  const ordersToday = db.orders.filter(o => new Date(o.createdAt).toDateString() === today).length;
  const unpaid = db.orders.filter(o => o.status !== "cancelled" && o.payment.status === "unpaid").length;
  const ready = db.orders.filter(o => o.status === "ready").length;
  const week = Date.now() - 7*DAY;
  const revenue = db.payments.filter(p => p.at >= week).reduce((s,p)=>s+p.amount,0);
  const COLUMNS = [
    ["new","New"],["preparing","Preparing"],["ready","Ready for pickup"],["out","Out for delivery"],["done","Completed"]
  ];
  const stats = `
    <div class="stats">
      <div class="stat card"><div class="v">${ordersToday}</div><div class="k">Orders today</div></div>
      <div class="stat card"><div class="v">${unpaid}</div><div class="k">Awaiting payment</div></div>
      <div class="stat card"><div class="v">${ready}</div><div class="k">Ready now</div></div>
      <div class="stat card"><div class="v">${naira(revenue)}</div><div class="k">Revenue · last 7 days</div></div>
    </div>`;
  const cols = COLUMNS.map(([key,label]) => {
    const list = db.orders.filter(o => o.status === key || (key === "done" && o.status === "cancelled"));
    return `<div class="col"><h3>${label}<span class="n">${list.length}</span></h3>
      <div class="olist">${list.length ? list.map(orderCard).join("") : `<div class="empty">No orders here</div>`}</div></div>`;
  }).join("");
  return stats + `<div class="board">${cols}</div>`;
}

function orderCard(o){
  const nxt = nextFor(o);
  const canCancel = ["new","preparing"].includes(o.status);
  const emailType = o.type === "delivery" ? "OUT_FOR_DELIVERY" : "READY";
  const latestEmailLog = (db.serverAutomationLogs || []).find(log => log.orderId === o.id && log.type === emailType);
  return `<div class="oc">
    <div class="r1"><span>${o.id}</span>
      ${o.payment.status === "paid" ? `<span class="pill b-paid">PAID</span>` : `<span class="pill b-unpaid">UNPAID · ${METHOD_LABEL[o.payment.method]}</span>`}
    </div>
    <div class="who">${esc(o.customerName)} · ${esc(o.customerPhone)}</div>
    <div class="meta">${o.size}kg × ${o.qty} · ${o.type === "pickup" ? "🛍️ pickup" : "🛵 " + esc(o.address || "delivery")}</div>
    <div class="meta">${naira(o.total)} · ${ago(o.createdAt)}</div>
    <div class="btns">
      ${nxt ? `<button class="btn small primary" data-action="advance" data-id="${o.id}">${nxt.label}</button>` : ""}
      ${latestEmailLog?.status === "FAILED" ? `<button class="btn small" data-action="retry-order-email" data-id="${o.id}">Email failed · Retry</button>` : ""}
      ${o.payment.status === "unpaid" && o.status !== "cancelled" ? `<button class="btn small" data-action="mark-paid" data-id="${o.id}">Mark paid</button>` : ""}
      ${canCancel ? `<button class="btn small ghost" data-action="cancel" data-id="${o.id}">✕</button>` : ""}
    </div>
  </div>`;
}
function nextFor(o){
  if(o.status === "new")      return {s:"preparing", label:"▶ Start prep"};
  if(o.status === "preparing") return o.type === "delivery"
      ? {s:"out",   label:"🛵 Out for delivery", email:"out"}
      : {s:"ready", label:"✅ Mark ready 📧",    email:"ready"};
  if(o.status === "ready")    return {s:"done", label:"🏁 Picked up"};
  if(o.status === "out")      return {s:"done", label:"🏁 Delivered"};
  return null;
}
async function advanceOrder(orderId){
  const o = db.orders.find(x => x.id === orderId);
  if(!o) return;
  const next = nextFor(o);
  if(!next) return;
  const nextStatus = next.s;
  const serverStatus = ({preparing:'PREPARING',ready:'READY',out:'OUT_FOR_DELIVERY',done:'COMPLETED'})[nextStatus];
  if(o._server && serverStatus && !next.email){
    try {
      const response = await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:o.id,status:serverStatus})});
      const result = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error || 'Could not update this order');
    } catch(error) {
      toast(error instanceof Error ? error.message : 'Could not update this order', 'warn');
      refreshServerOrders();
      return;
    }
  }
  o.status = nextStatus;
  if(o.status === 'done') o.completedAt = Date.now();
  if(next.email) orderEmail(o,next.email);
  else save();
  toast(`${o.id} → ${STATUS_LABEL[o.status]}`, 'ok');
  render();
}

function sReminders(){
  const rems = computeReminders();
  const rows = rems.map(r => `
    <tr>
      <td><b>${esc(r.name)}</b><div class="fine">${esc(r.phone)}</div></td>
      <td>${r.size} kg</td>
      <td>${fmtDT(r.last)}<div class="fine">${ago(r.last)}</div></td>
      <td>~${r.avg} days</td>
      <td>${dueBadge(r.daysLeft)}</td>
      <td><button class="btn mini" data-action="email-reminder" data-phone="${esc(r.phone)}" data-email="${esc(r.email)}" data-name="${esc(r.name)}" data-size="${r.size}">Email reminder</button></td>
    </tr>`).join("");
  return `<div class="card">
    <table class="table">
      <thead><tr><th>Customer</th><th>Cylinder</th><th>Last refill</th><th>Usage pace</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty">No history yet</td></tr>`}</tbody>
    </table>
  </div>
  <p class="fine" style="margin-top:8px">💡 Usage pace = average days between this customer's refills of the same cylinder size (falls back to ${db.settings.defaultRefillDays} days after a first refill).</p>`;
}

function emailStatusBadge(e){
  if(e.status === "sent") return `<span class="pill b-ok">✓ Triggered · via Make${e.sentAt ? " · " + fmtDT(e.sentAt) : ""}</span>`;
  if(e.status === "sending") return `<span class="pill b-due">… Sending${e.via === "make" ? " (Make)" : ""}</span>`;
  if(e.status === "failed") return `<span class="pill b-over">⚠ Not delivered</span>`;
  if(e.status === "queued") return `<span class="pill b-due">Not connected</span>`;
  if(e.status === "no-email") return `<span class="pill b-over">⚠ No customer email</span>`;
  return "";
}
function mailtoLink(e){
  return "mailto:" + (e.to_email || "") + "?subject=" + encodeURIComponent(e.subject) + "&body=" + encodeURIComponent(e.body);
}
function sEmails(){
  if(!db.emails.length && !db.serverAutomationLogs?.length) return `<div class="card pad empty">No emails yet — mark an order “ready” to trigger the ready-for-pickup email. 📧</div>`;
  return `<div style="max-width:720px;margin-bottom:10px">
    <div class="card pad" style="padding:12px 14px">
      ${makeConnected()
        ? `<b>Make.com automation connected</b> <span class="fine">— events are sent server-side and your Make scenario delivers the emails.</span>`
        : `<b>Make.com is not configured.</b> <span class="fine">Set <code>MAKE_WEBHOOK_URL</code> in the server environment. Failed calls are logged here for retry.</span>`}
    </div></div>
  <div style="display:grid;gap:10px;max-width:720px">${db.emails.map(e => `
    <div class="mail">
      <div class="mh" data-action="email-toggle" data-id="${e.id}">
        <span>📧</span>
        <span class="subj">${esc(e.subject)}</span>
        ${e.orderId ? `<span class="pill b-ok">${e.orderId}</span>` : ""}
        <span class="fade">${fmtDT(e.at)}</span>
        <span class="to">To: ${esc(e.to)} ${emailStatusBadge(e)}</span>
      </div>
      ${expandedEmail === e.id ? `<div class="body">${esc(e.body)}${e.error ? `\n\n⚠ Send error: ${esc(e.error)}` : ""}
        <div style="margin-top:10px">
          <button class="btn mini" data-action="email-mailto" data-id="${e.id}">📤 Open in mail app</button>
          ${e.status === "failed" ? `<button class="btn mini" style="margin-left:6px" data-action="email-retry" data-id="${e.id}">↻ Retry send</button>` : ""}
        </div></div>` : ""}
    </div>`).join("")}</div>
    ${db.serverAutomationLogs?.length ? `<div class="sec"><h2>Server automation log</h2><span class="sub">Make webhook calls and failures</span></div><div style="display:grid;gap:8px;max-width:720px">${db.serverAutomationLogs.map(log=>`<div class="mail pad"><b>${esc(log.type)}</b> · ${log.orderId ? esc(log.orderId) : esc(log.customerEmail || 'Customer reminder')} · ${fmtDT(log.createdAt)}<div>${log.status==='SENT'?'<span class="pill b-paid">SENT</span>':'<span class="pill b-over">FAILED</span>'} ${log.error?`<span class="fine">${esc(log.error)}</span>`:''}</div></div>`).join('')}</div>`:''}`;
}

function sPayments(){
  const sum = db.payments.reduce((s,p)=>s+p.amount,0);
  return `<div class="card" style="max-width:760px">
    <table class="table">
      <thead><tr><th>Reference</th><th>Order</th><th>Method</th><th>Amount</th><th>Date</th></tr></thead>
      <tbody>
        ${db.payments.slice(0,25).map(p => `<tr><td><code>${p.method ? p.method.toUpperCase()+"·" : ""}${esc(p.orderId)}</code></td><td>${p.orderId}</td><td>${METHOD_LABEL[p.method] || p.method}</td><td><b>${naira(p.amount)}</b></td><td>${fmtDT(p.at)}</td></tr>`).join("")}
        <tr style="background:#faf7f2"><td colspan="3"><b>Total recorded</b></td><td><b>${naira(sum)}</b></td><td></td></tr>
      </tbody>
    </table>
  </div>`;
}

function sPricing(){
  const rows = db.cylinders.map(c => `
    <tr><td><b>${c.size} kg</b> cylinder</td>
      <td><input class="input" style="max-width:130px;padding:6px 9px" type="number" min="50" step="1" id="ppk-${c.id}" value="${c.ppk}"> NGN/kg</td>
      <td><b>${naira(Math.round(c.size*c.ppk))}</b> <span class="fine">(now)</span></td>
      <td><label class="fine"><input type="checkbox" id="active-${c.id}" ${c.active===false?'':'checked'}> Available</label></td></tr>`).join("");
  return `<div class="grid2">
    <div class="card pad"><h3 style="margin-bottom:10px">Products — cylinder sizes & price per kg</h3>
      <table class="table"><thead><tr><th>Cylinder</th><th>Price per kg</th><th>Refill price</th><th>Availability</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row2" style="margin-top:14px"><div class="field"><label>New size (kg)</label><input class="input" id="new-cylinder-size" type="number" min="1" max="100" step="0.1" placeholder="e.g. 9"></div><div class="field"><label>Price per kg (₦)</label><input class="input" id="new-cylinder-price" type="number" min="50" placeholder="e.g. 1200"></div></div>
      <button class="btn" data-action="cylinder-add">Add cylinder size</button>
      <button class="btn primary" style="margin-top:12px" data-action="save-settings">Save changes</button>
    </div>
    <div class="card pad"><h3 style="margin-bottom:10px">Shop settings</h3>
      <div class="field"><label>Delivery fee</label><div class="fine">${naira(db.settings.deliveryFee)} (configured by DELIVERY_FEE_NGN on the server)</div></div>
      <div class="field"><label>Default refill reminder (days, first-time customers)</label><input class="input" id="st-days" type="number" min="7" value="${db.settings.defaultRefillDays}"></div>
      <div class="field"><label>Staff access</label><div class="fine">Set STAFF_EMAIL and STAFF_PASSWORD in the server environment.</div></div>
      <div class="field"><label>Shop address</label><div class="fine">${esc(SHOP_ADDRESS)} (configured in server environment)</div></div>
      <div class="field"><label>Shop phone (shown in emails)</label><input class="input" id="st-phone" value="${esc(db.settings.shopPhone)}"></div>
      <p class="fine">Paystack checkout uses matching pk_test_ and sk_test_ keys from the server environment.</p>
      <hr style="border:0;border-top:1px dashed var(--line);margin:16px 0">
      <h3 style="margin:0 0 4px">Make.com automation</h3>
      ${makeConnected()
        ? `<p class="fine" style="margin:2px 0 10px">✅ Make connected — events are sent server-side and your Make scenario sends the emails.</p>`
        : `<p class="fine" style="margin:2px 0 10px">Set <code>MAKE_WEBHOOK_URL</code> in the server's <code>.env</code>. Configure a Make Custom Webhook scenario to deliver the customer email. The URL stays on the server.</p>`}
      <div class="grid2" style="gap:8px;align-items:end">
        <div class="field"><label>Test delivery to</label><input class="input" id="st-make-test-to" placeholder="you@example.com"></div>
        <button class="btn" style="margin-bottom:8px" data-action="make-test">Send test webhook</button>
      </div>
      <button class="btn primary" data-action="save-settings">Save settings</button>
      <hr style="border:0;border-top:1px dashed var(--line);margin:16px 0">
      <button class="btn ghost" data-action="reset-demo">↺ Reset demo data</button>
    </div>
  </div>`;
}

/* ---------------- staff walk-in & PIN ---------------- */
function openWalkin(){
  const sizes = db.cylinders.filter(c=>c.active!==false).map(c => `<option value="${c.size}">${c.size} kg — ${naira(Math.round(c.size*c.ppk))}</option>`).join("");
  openModal(`
    <div class="mh" style="padding:16px 0 0"><h3>＋ Walk-in order</h3><button class="x" data-action="close-modal">✕</button></div>
    <div class="row2">
      <div class="field"><label>Customer name</label><input class="input" id="wi-name" placeholder="Name"></div>
      <div class="field"><label>Phone</label><input class="input" id="wi-phone" placeholder="0803…"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Cylinder</label><select class="input" id="wi-size">${sizes}</select></div>
      <div class="field"><label>Quantity</label><input class="input" id="wi-qty" type="number" min="1" value="1"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Handover</label><select class="input" id="wi-type"><option value="pickup">Pickup at shop</option><option value="delivery">Delivery</option></select></div>
      <div class="field"><label>Address (if delivery)</label><input class="input" id="wi-addr" placeholder="Street…"></div>
    </div>
    <label class="method on" style="margin-bottom:12px"><input type="checkbox" id="wi-paid" checked> <span>Already paid (cash at shop)</span></label>
    <button class="btn primary block" data-action="walkin-submit">Add to board</button>
  `);
}
function submitWalkin(){
  const name = document.getElementById("wi-name").value.trim();
  const phone = document.getElementById("wi-phone").value.trim();
  const size = parseFloat(document.getElementById("wi-size").value);
  const qty = Math.max(1, parseInt(document.getElementById("wi-qty").value) || 1);
  const type = document.getElementById("wi-type").value;
  const addr = document.getElementById("wi-addr").value.trim();
  const paidNow = document.getElementById("wi-paid").checked;
  if(!name || phone.replace(/\D/g,"").length < 7){ toast("⚠ Add a name and a valid phone number", "warn"); return; }
  const unit = unitPrice(size);
  const fee = type === "delivery" ? db.settings.deliveryFee : 0;
  createOrder({
    customerName:name, customerPhone:phone, customerEmail:"", size, qty, type,
    address:type === "delivery" ? addr : "", status:"new",
    unitPrice:unit, deliveryFee:fee, total:unit*qty+fee,
  }, paidNow
    ? {status:"paid", method:"cash", ref:"CASH", amount:unit*qty+fee, at:Date.now()}
    : {status:"unpaid", method:"cash", ref:"", amount:0, at:0});
  closeModal();
  toast("✅ Walk-in order added to the board", "ok");
  staffTab = "board";
  render();
}

function pinGate(){ openAuthModal('staff'); }

/* =========================================================
   EVENTS
   ========================================================= */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-action]");
  if(!t) return;
  const a = t.dataset.action;

  if(a === 'auth-open'){ openAuthModal('login'); return; }
  if(a === 'auth-switch'){ openAuthModal(authMode==='register'?'login':'register'); return; }
  if(a === 'auth-reset'){ openAuthModal('reset-request'); return; }
  if(a === 'auth-logout'){
    fetch('/api/auth/me',{method:'DELETE'}).finally(()=>{currentUser=null;staffOk=false;sessionStorage.removeItem('gasup-staff-ok');view='customer';render();toast('Signed out','ok');});
    return;
  }
  if(a === 'auth-submit'){
    const emailNode=document.getElementById('auth-email'), passwordNode=document.getElementById('auth-password');
    const input={email:emailNode?.value.trim() || ''};
    if(passwordNode)input.password=passwordNode.value;
    if(authMode==='register'){input.name=document.getElementById('auth-name').value.trim();input.phone=document.getElementById('auth-phone').value.trim();}
    if(authMode==='reset-complete')input.token=resetToken;
    const endpoint=authMode==='staff'?'/api/auth/staff-login':authMode==='register'?'/api/auth/register':authMode==='reset-request'?'/api/auth/password-reset':authMode==='reset-complete'?'/api/auth/password-reset/complete':'/api/auth/login';
    t.disabled=true; t.textContent='Signing in…';
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
      .then(async response=>{const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Sign in failed');return result;})
      .then(result=>{
        if(authMode==='reset-request'){closeModal();toast(result.message,'ok');return;}
        if(authMode==='reset-complete'){resetToken='';currentUser=null;staffOk=false;view='customer';sessionStorage.removeItem('gasup-staff-ok');closeModal();render();openAuthModal('login');toast('Password updated. Sign in with your new password.','ok');return;}
        currentUser=result.user; staffOk=currentUser.role==='STAFF';
        if(staffOk){sessionStorage.setItem('gasup-staff-ok','1');view='staff';}
        else{draft.name=currentUser.name;draft.email=currentUser.email;draft.phone=currentUser.phone;myPhone=currentUser.phone;localStorage.setItem('gasup-my-phone',myPhone);}
        closeModal();render();
        if(staffOk){refreshServerOrders();refreshServerAutomationLogs();}
        else {refreshCustomerOrders();if(checkoutAfterAuth){checkoutAfterAuth=false;openPayModal();}}
        toast(staffOk?'Welcome to the staff console':'Signed in to GasUp','ok');
      })
      .catch(error=>{const node=document.getElementById('auth-error');if(node)node.textContent=error.message;t.disabled=false;t.textContent=authMode==='staff'?'Sign in as staff':authMode==='register'?'Create account':'Sign in';});
    return;
  }
  if(a === "nav-view"){
    const v = t.dataset.view;
    if(v === "staff" && currentUser?.role!=='STAFF'){ pinGate(); return; }
    view = v; render(); if(v === "staff"){refreshServerOrders();refreshServerAutomationLogs();} return;
  }
  if(a === "scroll-order"){ scrollOrder(); return; }
  if(a === "save-manual-days"){
    if(currentUser?.role!=='CUSTOMER'){openAuthModal('login');return;}
    const size = Number(t.dataset.size), input = document.getElementById("manual-days-" + size), days = Number(input?.value);
    if(!Number.isFinite(days) || days < 7 || days > 90){ toast("Enter an estimate from 7 to 90 days", "warn"); return; }
    t.disabled = true;
    try {
      const response = await fetch('/api/customer/reminder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days,sizeKg:size})});
      const result = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error || 'Could not save your refill estimate');
    } catch(error) {
      t.disabled = false;
      toast(error instanceof Error ? error.message : 'Could not save your refill estimate', 'warn');
      return;
    }
    db.manualRefillDays ||= {};
    db.manualRefillDays[myPhone + "|" + size] = days;
    save(); render();
    toast("Refill estimate saved", "ok");
    return;
  }
  if(a === 'cylinder-add'){
    const size=Number(document.getElementById('new-cylinder-size').value), ppk=Number(document.getElementById('new-cylinder-price').value);
    if(!Number.isFinite(size)||size<=0||size>100||!Number.isFinite(ppk)||ppk<50){toast('Enter a size up to 100 kg and a price per kg of at least ₦50.','warn');return;}
    const existing=db.cylinders.find(c=>Math.abs(c.size-size)<.001);
    if(existing){existing.ppk=ppk;existing.active=true;} else db.cylinders.push({id:'new-'+Date.now(),size,ppk,active:true});
    render();toast('Cylinder added. Save changes to publish it.','ok');return;
  }
  if(a === "pick-size"){ draft.size = parseFloat(t.dataset.size); render(); scrollOrder(); return; }
  if(a === "qty"){ draft.qty = Math.min(6, Math.max(1, draft.qty + parseInt(t.dataset.d))); render(); scrollOrder(); return; }
  if(a === "pick-method"){
    document.querySelectorAll("#methods .method").forEach(m => m.classList.remove("on"));
    t.classList.add("on");
    t.querySelector("input").checked = true;
    return;
  }
  if(a === "place-order"){
    const digits = draft.phone.replace(/\D/g,"");
    if(draft.name.trim().length < 2){ toast("⚠ Enter your full name", "warn"); document.getElementById("f-name").focus(); return; }
    if(digits.length < 7){ toast("⚠ Enter a valid phone number", "warn"); document.getElementById("f-phone").focus(); return; }
    if(draft.type === "delivery" && draft.address.trim().length < 5){ toast("⚠ Enter a delivery address", "warn"); document.getElementById("f-address").focus(); return; }
    const emailVal = draft.email.trim();
    if(!emailVal){ toast("⚠ Add your email — your “ready for pickup” notice is sent there", "warn"); document.getElementById("f-email").focus(); return; }
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)){ toast("⚠ That email doesn't look right — check it and try again", "warn"); document.getElementById("f-email").focus(); return; }
    if(currentUser?.role!=='CUSTOMER'){checkoutAfterAuth=true;openAuthModal('login');return;}
    draft.name=currentUser.name;draft.phone=currentUser.phone;draft.email=currentUser.email;
    openPayModal(); return;
  }
  if(a === "do-pay"){ doPay(); return; }
  if(a === "close-modal" || a === "pay-done"){ closeModal(); return; }
  if(a === "overlay-close"){ if(e.target === t){ closeModal(); } return; }
  if(a === "noop"){ return; }

  if(a === "staff-tab"){ staffTab = t.dataset.tab; render(); if(staffTab==='emails') refreshServerAutomationLogs(); return; }
  if(a === "walkin-open"){ openWalkin(); return; }
  if(a === "walkin-submit"){ submitWalkin(); return; }
  if(a === "advance"){
    advanceOrder(t.dataset.id); return;
  }
  if(a === "retry-order-email"){
    const o = db.orders.find(x => x.id === t.dataset.id);
    if(!o){ toast("Order not found", "warn"); return; }
    orderEmail(o, o.type === "delivery" ? "out" : "ready");
    refreshServerAutomationLogs();
    return;
  }
  if(a === "mark-paid"){
    const o = db.orders.find(x => x.id === t.dataset.id);
    setPaid(o, o.payment.method === "on_delivery" ? "cash" : (o.payment.method || "cash"));
    toast(`💰 ${o.id} marked paid`, "ok");
    render(); return;
  }
  if(a === "cancel"){
    const o = db.orders.find(x => x.id === t.dataset.id);
    o.status = "cancelled"; save();
    toast(`${o.id} cancelled`, "warn");
    render(); return;
  }
  if(a === "email-toggle"){ expandedEmail = expandedEmail === t.dataset.id ? null : t.dataset.id; render(); return; }
  if(a === "email-mailto"){
    const e = db.emails.find(x => x.id === t.dataset.id);
    if(!e) return;
    const a2 = document.createElement("a");
    a2.href = mailtoLink(e);
    document.body.appendChild(a2); a2.click(); a2.remove();
    return;
  }
  if(a === "email-retry"){
    const e = db.emails.find(x => x.id === t.dataset.id);
    if(!e) return;
    if(!/@/.test(e.to || "")){ toast("⚠ This email has no real address to retry", "warn"); return; }
    e.status = "pending"; save();
    deliverEmail(e);
    render();
    return;
  }
  if(a === "email-reminder"){
    const phone = t.dataset.phone, email = t.dataset.email, name = t.dataset.name, size = t.dataset.size;
    const e = pushEmail(null, {
      to: email || "customer (phone " + phone + ")",
      subject:`Time to refill your ${size} kg gas cylinder`,
      body:`Hello ${name},\n\nJudging by your usual usage, your ${size} kg cylinder is probably close to empty.\n\nBeat the queues — order your refill before you run out:\n• Order online on the GasUp app (pickup or delivery)\n• Or reply to this message and we'll prepare it for you\n\nGasUp Team`,
      orderId:"", event:"reminder"
    });
    staffTab = "emails"; render();
    toast(e.status === "sent" ? `✅ Reminder triggered for ${email}` : e.status === "pending" ? "📧 Reminder sending… check status in Emails tab" : e.status === "queued" ? `📧 Reminder written for ${name} — configure MAKE_WEBHOOK_URL on the server` : "⚠ Customer has no email — reminder saved to outbox", e.status === "sent" || e.status === "pending" ? "ok" : "warn");
    return;
  }
  if(a === "find-mine"){
    const v = document.getElementById("mine-phone").value;
    if(v.replace(/\D/g,"").length >= 7){ myPhone = v; localStorage.setItem("gasup-my-phone", v); }
    else toast("⚠ Enter a phone number", "warn");
    render(); return;
  }
  if(a === "reorder"){
    draft.size = parseFloat(t.dataset.size); draft.qty = 1;
    view = "customer"; render(); scrollOrder(); return;
  }
  if(a === "save-settings"){
    db.cylinders.forEach(c => {
      const v = parseFloat(document.getElementById("ppk-"+c.id).value);
      if(v >= 50) c.ppk = v;
      c.active=document.getElementById('active-'+c.id).checked;
    });
    const days = parseFloat(document.getElementById("st-days").value);
    const ph = document.getElementById("st-phone").value.trim();
    if(days >= 7) db.settings.defaultRefillDays = days;
    if(ph) db.settings.shopPhone = ph;
    save(); render();
    fetch('/api/cylinders', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cylinders:db.cylinders.map(c=>({sizeKg:c.size,pricePerKg:c.ppk,active:c.active!==false}))})})
      .then(async response => { const result=await response.json().catch(()=>({})); if(!response.ok) throw new Error(result.error || 'Server price sync failed'); toast('Shop and cylinder prices saved', 'ok'); })
      .catch(error => toast(`Shop settings saved locally; server price sync failed: ${error.message}`, 'warn'));
    return;
  }
  if(a === "make-test"){
    const to = document.getElementById("st-make-test-to").value.trim();
    if(!makeConnected()){ toast("⚠ Save your Make webhook URL first", "warn"); return; }
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)){ toast("⚠ Enter a valid email — Make will send the test there", "warn"); return; }
    pushEmail(null, {
      to,
      subject:"Make test — GasUp automation works 🎉",
      body:`Hello there,\n\nThis is a test event from the GasUp shop console.\nIf Make delivered this to your inbox, payment + status emails will reach your customers automatically.\n\nGasUp Team`,
      orderId:"", event:"test", forceVia:"make"
    });
    document.getElementById("st-make-test-to").value = "";
    return;
  }
  if(a === "reset-demo"){
    if(confirm("Reset all demo data (orders, payments, emails, settings)?")){
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem("gasup-my-phone");
      sessionStorage.clear();
      location.reload();
    }
    return;
  }
});


// keep text fields in the draft without re-rendering (preserves focus)
document.addEventListener("input", e => {
  const f = e.target.dataset && e.target.dataset.user;
  if(f) draft[f] = e.target.value;
});
document.addEventListener("change", e => {
  if(e.target.dataset && e.target.dataset.draft){
    draft[e.target.dataset.draft] = e.target.value;
    render(); scrollOrder();
  }
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeModal();
  if(e.key === "Enter" && document.getElementById("auth-password") === document.activeElement){
    const b = document.querySelector('[data-action="auth-submit"]'); if(b) b.click();
  }
});

function scrollOrder(){
  const el = document.getElementById("order-section");
  if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
}

/* ---------------- init ---------------- */
db = load();
if(!db || db.v !== 1) seed();
if(!db.manualRefillDays) db.manualRefillDays = {};
if(typeof db.settings.paystackKey !== "string") db.settings.paystackKey = "";
db.settings.paystackKey = "";
/* Keep legacy demo defaults aligned with the current shop location. */
if(["24 Awolowo Road, Ikoyi, Lagos", "24 Akpakpava Road, Benin City, Edo State"].includes(db.settings.shopAddress)) db.settings.shopAddress = SHOP_ADDRESS;
render();
const resetUrl=new URL(window.location.href);
resetToken=resetUrl.searchParams.get('password_reset') || '';
if(resetToken){history.replaceState({},'',resetUrl.pathname);openAuthModal('reset-complete');}
fetch('/api/auth/me').then(response=>response.ok?response.json():null).then(result=>{
  currentUser=result?.user || null;
  staffOk=currentUser?.role==='STAFF';
  if(currentUser?.role==='CUSTOMER'){
    draft.name=currentUser.name;draft.email=currentUser.email;draft.phone=currentUser.phone;
    myPhone=currentUser.phone;localStorage.setItem('gasup-my-phone',myPhone);
  }
  render();
  if(staffOk){refreshServerOrders();refreshServerAutomationLogs();}
  else if(currentUser?.role==='CUSTOMER')refreshCustomerOrders();
}).catch(()=>{});
async function processPaymentReturn(){
  const url = new URL(window.location.href);
  if(!url.searchParams.has('payment')) return;
  const reference = url.searchParams.get('reference') || '';
  const orderId = url.searchParams.get('orderId') || '';
  history.replaceState({}, '', url.pathname);
  if(!reference){
    toast('Payment was not completed. You can try again from your order.', 'warn');
    return;
  }
  try {
    const response = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
    const result = await response.json().catch(() => ({}));
    if(!response.ok || !result.ok){
      const failedOrder = db.orders.find(item => item.id === (result.orderId || orderId));
      if(failedOrder){ failedOrder.payment = {status:'failed', method:'paystack', ref:reference, amount:failedOrder.total, at:Date.now()}; save(); render(); }
      toast(result.message || 'Payment verification failed.', 'warn');
      return;
    }
    const o = db.orders.find(item => item.id === (result.orderId || orderId));
    if(o && o.payment.status !== 'paid'){
      o.payment = {status:'paid', method:'paystack', ref:reference, amount:o.total, at:Date.now()};
      db.payments.unshift({id:'py'+o.id+Date.now(), orderId:o.id, method:'paystack', amount:o.total, at:Date.now(), reference});
      save();
    }
    render();
    toast('Payment verified by Paystack. Your order is confirmed.', 'ok');
  } catch {
    toast('Could not verify payment right now. Refresh this page to check again.', 'warn');
  }
}
processPaymentReturn();
fetch("/api/config").then(r => r.ok ? r.json() : null).then(async config => {
  if(!config) return;
  window.gasupConfig = config;
  SHOP_NAME = config.shopName || "GasUp";
  SHOP_ADDRESS = config.shopAddress || SHOP_ADDRESS;
  db.settings.shopAddress = SHOP_ADDRESS;
  db.settings.deliveryFee = Number(config.deliveryFeeNgn) || 0;
  db.settings.paystackKey = config.paystackConfigured ? config.paystackPublicKey : "";
  const cylinderResponse = await fetch('/api/cylinders');
  if(cylinderResponse.ok){
    const {cylinders=[]} = await cylinderResponse.json();
    db.cylinders = cylinders.map(c=>{
      const existing = db.cylinders.find(item=>Math.abs(item.size-c.sizeKg)<.001);
      return {id:existing?.id || c.id, size:c.sizeKg, ppk:c.pricePerKg,active:!!c.active};
    });
  }
  save();
  render();
}).catch(() => {});

/* Reflect staff updates from other open app tabs and refresh the order board. */
window.addEventListener("storage", event => {
  if(event.key !== DB_KEY || !event.newValue) return;
  try { db = JSON.parse(event.newValue); render(); } catch {}
});
window.setInterval(() => {
  if(view !== "staff") return;
  refreshServerOrders();
  if(staffTab === 'emails') refreshServerAutomationLogs();
  const latest = load();
  if(latest && JSON.stringify(latest.orders) !== JSON.stringify(db.orders)) {
    db = latest;
    render();
  }
}, 12000);




