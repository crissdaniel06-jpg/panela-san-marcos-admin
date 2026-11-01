(() => {
  const config = window.PANELA_ADMIN_CONFIG || {};
  const client = window.supabase?.createClient && config.url && config.anonKey ? window.supabase.createClient(config.url, config.anonKey) : null;
  const loginPanel = document.getElementById('login-panel');
  const adminPanel = document.getElementById('admin-panel');
  const form = document.getElementById('login-form');
  const notice = document.getElementById('notice');
  const ordersNode = document.getElementById('orders');
  const dialog = document.getElementById('order-dialog');
  let orders = [];
  let products = [];
  let selectedOrder = null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `$${Number(n||0).toFixed(2)}`;
  const fmt = value => value ? new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  function message(text, error=false){notice.textContent=text;notice.classList.toggle('error',error)}
  let toastTimer;
  function showToast(text,error=false){const toast=document.getElementById('admin-toast');toast.textContent=text;toast.classList.toggle('error',error);toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true},4500)}
  async function checkSession(){
    if(!client){loginPanel.hidden=false;document.getElementById('login-message').textContent='Configura la URL y la clave pública de Supabase en config.js.';return}
    const {data:{session}}=await client.auth.getSession();
    if(!session){loginPanel.hidden=false;return}
    if(session.user.app_metadata?.role!=='admin'){await client.auth.signOut();loginPanel.hidden=false;document.getElementById('login-message').textContent='Esta cuenta no tiene acceso administrativo. Solicita al propietario que habilite el rol admin.';return}
    loginPanel.hidden=true;adminPanel.hidden=false;document.getElementById('signout').hidden=false;await loadOrders();
  }
  async function loadOrders(){
    message('Cargando pedidos…');
    const {data,error}=await client.from('orders').select('id,status,subtotal,shipping,total,payment_method,payment_status,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city,created_at,order_items(product_id,product_name,quantity,unit_price,line_subtotal,presentation),transfer_receipts(id,storage_path,review_status,review_note,uploaded_at)').order('created_at',{ascending:false}).limit(100);
    if(error){orders=[];renderOrders();message('No se pudieron cargar los pedidos. Verifica las políticas administrativas de Supabase.',true);return}
    orders=data||[];renderOrders();message(`${orders.length} pedidos cargados.`);
  }
  async function loadProducts(){
    const box=document.getElementById('inventory-notice');box.textContent='Cargando inventario…';
    const {data,error}=await client.from('products').select('id,name,stock,available,product_type,presentation').order('name');
    if(error){box.textContent='No se pudo cargar el inventario.';return}
    products=data||[];renderProducts();box.textContent=`${products.length} productos cargados.`;
  }
  function renderProducts(){
    const q=document.getElementById('product-search').value.trim().toLowerCase();
    const rows=products.filter(p=>p.name.toLowerCase().includes(q));
    document.getElementById('products').innerHTML=rows.map(p=>`<article class="order"><div><h2>${esc(p.name)}</h2><p>${esc(p.presentation||p.product_type)} · ${p.available?'Disponible':'Oculto'}</p></div><label>Unidades en stock<input data-stock="${p.id}" type="number" min="0" max="100000" value="${p.stock}" aria-label="Stock de ${esc(p.name)}"></label><button class="quiet" data-save-stock="${p.id}">Guardar stock</button></article>`).join('');
    document.querySelectorAll('[data-save-stock]').forEach(b=>b.addEventListener('click',()=>saveStock(Number(b.dataset.saveStock))));
  }
  async function saveStock(id){
    const input=document.querySelector(`[data-stock="${id}"]`),value=Number(input.value),p=products.find(x=>x.id===id),box=document.getElementById('inventory-notice');
    if(!Number.isInteger(value)||value<0||value>100000){box.textContent='Ingresa un stock entero entre 0 y 100 000.';return}
    if(value===p.stock){box.textContent='El stock no cambió.';return}
    const button=document.querySelector(`[data-save-stock="${id}"]`);button.disabled=true;
    const {error}=await client.from('products').update({stock:value,updated_at:new Date().toISOString()}).eq('id',id);
    button.disabled=false;if(error){box.textContent='No se pudo actualizar el stock. Verifica el rol administrador.';showToast(box.textContent,true);return}
    p.stock=value;box.textContent=`Stock de ${p.name} actualizado a ${value} unidades.`;showToast(box.textContent);
  }
  function renderOrders(){
    const term=document.getElementById('search').value.trim().toLowerCase(), status=document.getElementById('status-filter').value;
    const found=orders.filter(o=>(!status||o.status===status)&&(!term||o.id.toLowerCase().includes(term)||`${o.customer_first_name} ${o.customer_last_name}`.toLowerCase().includes(term)));
    document.getElementById('counts').textContent=`${found.length} pedidos · ${orders.filter(o=>o.status==='PENDIENTE').length} pendientes`;
    ordersNode.innerHTML=found.length?found.map(o=>`<article class="order"><div><h2>Pedido ${esc(o.id.slice(0,8).toUpperCase())}</h2><p>${esc(o.customer_first_name)} ${esc(o.customer_last_name)} · ${esc(fmt(o.created_at))}</p></div><p><span class="badge">${esc(o.status)}</span><br>${esc(o.payment_method)} · ${esc(o.payment_status)}</p><button class="quiet" data-open="${esc(o.id)}">Ver detalle · ${money(o.total)}</button></article>`).join(''):'<p class="empty">No hay pedidos que coincidan con la búsqueda.</p>';
    ordersNode.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openOrder(b.dataset.open)));
  }
  async function openOrder(id){
    selectedOrder=orders.find(o=>o.id===id);if(!selectedOrder)return;
    const o=selectedOrder, receipt=o.transfer_receipts?.[0];
    let receiptMarkup='<p>No hay comprobante adjunto.</p>';
    if(receipt){const {data,error}=await client.storage.from('transfer-receipts').createSignedUrl(receipt.storage_path,60);receiptMarkup=error?'<p>No se pudo abrir el comprobante. Revisa el acceso privado de Storage.</p>':`<a class="receipt-link" target="_blank" rel="noopener" href="${esc(data.signedUrl)}">Abrir comprobante privado (enlace de 60 s)</a><p>Revisión: ${esc(receipt.review_status)} ${esc(receipt.review_note||'')}</p><label>Nota de revisión<textarea id="review-note" maxlength="500"></textarea></label><div class="actions"><button data-review="APROBADO">Verificar pago</button><button class="quiet" data-review="REQUIERE_CORRECCION">Solicitar corrección</button><button class="danger" data-review="RECHAZADO">Rechazar</button></div>`}
    document.getElementById('dialog-title').textContent=`Pedido ${id.slice(0,8).toUpperCase()}`;
    document.getElementById('order-detail').innerHTML=`<div class="detail-grid"><p><b>Cliente</b><br>${esc(o.customer_first_name)} ${esc(o.customer_last_name)}</p><p><b>Contacto</b><br>${esc(o.customer_email)} · ${esc(o.customer_phone)}</p><p><b>Entrega</b><br>${esc(o.delivery_address)}, ${esc(o.delivery_city)}</p><p><b>Pago</b><br>${esc(o.payment_method)} · ${esc(o.payment_status)}</p><p><b>Estado</b><br>${esc(o.status)}</p><p><b>Creado</b><br>${esc(fmt(o.created_at))}</p></div><h3>Productos</h3>${(o.order_items||[]).map(i=>`<div class="item-row item"><p>${esc(i.product_name)} × ${i.quantity}<br>${money(i.unit_price)} c/u</p><label>Cantidad<input data-quantity="${i.product_id}" type="number" min="1" max="100" value="${i.quantity}" disabled></label></div>`).join('')}<p>Subtotal ${money(o.subtotal)} · Envío ${money(o.shipping)} · <b>Total ${money(o.total)}</b></p>${receiptMarkup}<h3>Acciones del pedido</h3><label>Estado<select id="next-status"><option>PENDIENTE</option><option>CANCELADO</option><option>COMPLETADO</option></select></label><button id="save-status" class="primary">Guardar estado</button><p class="message" id="detail-message" role="status"></p>`;
    document.getElementById('next-status').value=o.status;
    document.getElementById('save-status').addEventListener('click',()=>updateStatus(o));
    document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>reviewReceipt(receipt,b.dataset.review)));
    dialog.showModal();
  }
  async function reviewReceipt(receipt,decision){
    if(!receipt)return;const note=document.getElementById('review-note')?.value||'';
    const {data,error}=await client.rpc('review_transfer_receipt',{p_receipt_id:receipt.id,p_decision:decision,p_note:note});
    document.getElementById('detail-message').textContent=error?'La revisión no se guardó. Confirma tu rol admin.':data?'Revisión guardada.':'Este comprobante ya fue revisado.';
    if(!error&&data)await loadOrders();
  }
  async function updateStatus(order){
    const next=document.getElementById('next-status').value, msg=document.getElementById('detail-message');
    if(next===order.status){msg.textContent='El pedido ya tiene ese estado.';return}
    if(next==='CANCELADO'&&order.status!=='PENDIENTE'){msg.textContent='Solo se puede cancelar un pedido pendiente.';return}
    if(next==='CANCELADO'&&!confirm('¿Cancelar este pedido y devolver las unidades al inventario?'))return;
    const {data,error}=await client.rpc('admin_update_order_status',{p_order_id:order.id,p_status:next});
    msg.textContent=error?'No se pudo actualizar. Comprueba si la migración administrativa está aplicada.':data?'Estado actualizado.':'La transición no está permitida.';
    if(!error&&data){await loadOrders();dialog.close()}
  }
  form.addEventListener('submit',async e=>{e.preventDefault();document.getElementById('login-message').textContent='';const fd=new FormData(form);const {error}=await client.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error){document.getElementById('login-message').textContent='No se pudo iniciar sesión. Revisa tus datos.';return}await checkSession()});
  document.getElementById('signout').addEventListener('click',async()=>{await client.auth.signOut();location.reload()});
  document.getElementById('search').addEventListener('input',renderOrders);document.getElementById('status-filter').addEventListener('change',renderOrders);document.getElementById('refresh').addEventListener('click',loadOrders);document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  document.getElementById('orders-tab').addEventListener('click',()=>{document.getElementById('orders-view').hidden=false;document.getElementById('inventory-view').hidden=true});
  document.getElementById('inventory-tab').addEventListener('click',async()=>{document.getElementById('orders-view').hidden=true;document.getElementById('inventory-view').hidden=false;if(!products.length)await loadProducts()});
  document.getElementById('product-search').addEventListener('input',renderProducts);
  checkSession();
})();
