-- Read and operational actions for the separate San Marcos admin panel.
-- Authentication is restricted to trusted app_metadata.role = 'admin'.
grant select on public.orders, public.order_items, public.transfer_receipts to authenticated;

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

drop policy if exists items_admin_read on public.order_items;
create policy items_admin_read on public.order_items for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

drop policy if exists receipts_admin_read on public.transfer_receipts;
create policy receipts_admin_read on public.transfer_receipts for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

drop policy if exists admin_read_transfer_receipts on storage.objects;
create policy admin_read_transfer_receipts on storage.objects for select to authenticated
  using (bucket_id = 'transfer-receipts' and (select auth.jwt()->'app_metadata'->>'role') = 'admin');

create or replace function public.admin_update_order_status(p_order_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_current text;
  v_demand record;
begin
  if v_user is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('CANCELADO','COMPLETADO') then raise exception 'INVALID_STATUS'; end if;
  select status into v_current from public.orders where id=p_order_id for update;
  if not found or v_current <> 'PENDIENTE' then return false; end if;
  if p_status='CANCELADO' then
    update public.orders set status='CANCELADO',updated_at=now() where id=p_order_id and status='PENDIENTE';
    for v_demand in
      select product_id,sum(quantity)::integer quantity from (
        select oi.product_id,oi.quantity from public.order_items oi
        where oi.order_id=p_order_id and oi.product_type<>'combo' and oi.product_id is not null
        union all
        select c.component_product_id,oi.quantity*c.quantity_per_combo
        from public.order_items oi join public.order_item_components c on c.order_item_id=oi.id
        where oi.order_id=p_order_id and oi.product_type='combo' and c.component_product_id is not null
      ) d group by product_id order by product_id
    loop
      update public.products set stock=stock+v_demand.quantity,updated_at=now() where id=v_demand.product_id;
    end loop;
  else
    update public.orders set status='COMPLETADO',updated_at=now() where id=p_order_id and status='PENDIENTE';
  end if;
  return found;
end;
$$;
revoke all on function public.admin_update_order_status(uuid,text) from public,anon;
grant execute on function public.admin_update_order_status(uuid,text) to authenticated;
