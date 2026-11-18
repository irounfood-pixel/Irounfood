/* Read-only inventory planner. No orders, reservations or stock are mutated.
 * Stock is in each item's base unit. Whole production batches are assumed.
 * `immediate` uses existing raw/semi stock only; `recursive` may produce semi
 * components from confirmed recipes. Products may contain raw/semi; semi may
 * contain raw or other semi items (cycles are rejected). Unknown values never silently become zero.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InventoryPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const EPS = 1e-9;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const countUnit = unit => unit !== 'kg';
  const clean = n => Math.abs(n) < EPS ? 0 : Math.round(n * 1e9) / 1e9;
  function createModel(items, recipes) {
    const byId = new Map(), byParent = new Map(), issues = [];
    const fail = (code, id, detail) => issues.push({code, itemId:id, detail});
    if (!Array.isArray(items) || !Array.isArray(recipes)) return {issues:[{code:'INVALID_INPUT'}]};
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id) { fail('INVALID_ITEM', null); continue; }
      if (byId.has(item.id)) fail('DUPLICATE_ITEM', item.id);
      byId.set(item.id, {...item});
      if (!['raw','semi','product'].includes(item.kind)) fail('INVALID_KIND', item.id);
      if (!['kg','개','봉','세트','팩','장','쌍','롤'].includes(item.unit)) fail('INVALID_UNIT', item.id);
      if (item.stock !== null && (!finite(item.stock) || item.stock < 0 || (countUnit(item.unit) && !Number.isInteger(item.stock)))) fail('INVALID_STOCK', item.id);
      const reserved = item.reserved === undefined ? 0 : item.reserved;
      if (!finite(reserved) || reserved < 0 || (countUnit(item.unit) && !Number.isInteger(reserved))) fail('INVALID_RESERVED', item.id);
      if (item.stock !== null && finite(item.stock) && reserved > item.stock + EPS) fail('OVER_RESERVED', item.id);
    }
    for (const recipe of recipes) {
      if (!recipe || typeof recipe.parentId !== 'string') { fail('INVALID_RECIPE', null); continue; }
      const id = recipe.parentId, parent = byId.get(id);
      if (byParent.has(id)) fail('DUPLICATE_RECIPE', id);
      byParent.set(id, {...recipe, lines: Array.isArray(recipe.lines) ? recipe.lines.map(x=>({...x})) : []});
      if (!parent) fail('UNKNOWN_PARENT', id);
      if (parent && parent.kind === 'raw') fail('RAW_HAS_RECIPE', id);
      if (!['confirmed','draft'].includes(recipe.status)) fail('INVALID_RECIPE_STATUS', id);
      // Draft recipes may have missing quantities, but cannot be used for calculations.
      if (recipe.status === 'confirmed' && (!finite(recipe.yieldQty) || recipe.yieldQty < 0.000001 || (parent && countUnit(parent.unit) && !Number.isInteger(recipe.yieldQty)))) fail('INVALID_YIELD', id);
      if (recipe.status === 'confirmed' && (!Array.isArray(recipe.lines) || !recipe.lines.length)) fail('EMPTY_RECIPE', id);
      for (const line of (Array.isArray(recipe.lines) ? recipe.lines : [])) {
        if (!line || typeof line !== 'object') { fail('INVALID_LINE', id); continue; }
        const child = byId.get(line.itemId);
        if (!child) fail('UNKNOWN_COMPONENT', id, line.itemId);
        if (child && parent && child.kind === 'product') fail('INVALID_COMPONENT_KIND', id, line.itemId);
        if (recipe.status === 'confirmed' && (!finite(line.qty) || line.qty < 0.000001 || (child && countUnit(child.unit) && !Number.isInteger(line.qty) && line.rounding !== 'ceil'))) fail('INVALID_LINE_QTY', id, line.itemId);
      }
    }
    const done = new Set(), active = new Set();
    function visit(id) {
      if (active.has(id)) { fail('RECIPE_CYCLE', id); return; }
      if (done.has(id)) return;
      active.add(id);
      for (const line of byParent.get(id)?.lines || []) if(line) visit(line.itemId);
      active.delete(id); done.add(id);
    }
    for (const id of byParent.keys()) visit(id);
    return {byId,byParent,issues};
  }
  function plan(items, recipes, demands, options) {
    const opts = {...{mode:'immediate',useFinishedStock:true},...options};
    const model = createModel(items, recipes);
    if (!['immediate','recursive'].includes(opts.mode)) model.issues.push({code:'INVALID_MODE'});
    if (!Array.isArray(demands) || !demands.length) model.issues.push({code:'EMPTY_DEMAND'});
    if (model.issues.length) return {status:'invalid',feasible:null,issues:model.issues};
    const {byId,byParent} = model;
    const demandMap = new Map();
    for (const d of demands) {
      const item = byId.get(d?.itemId);
      if (!item || !finite(d.qty) || d.qty <= 0 || (countUnit(item.unit) && !Number.isInteger(d.qty))) return {status:'invalid',feasible:null,issues:[{code:'INVALID_DEMAND',itemId:d?.itemId}]};
      demandMap.set(d.itemId, (demandMap.get(d.itemId)||0)+d.qty);
    }
    const available = new Map(), used = new Map(), required = new Map(), produced = new Map(), shortages = new Map(), unknown = new Map(), estimated = new Set();
    for (const item of byId.values()) available.set(item.id,item.stock === null ? null : clean(item.stock-(item.reserved||0)));
    const add = (map,id,qty) => map.set(id,clean((map.get(id)||0)+qty));
    function take(id,qty) {
      const item = byId.get(id), stock = available.get(id);
      if (stock === null) {unknown.set(id,'UNKNOWN_STOCK'); return null;}
      const n = Math.min(stock,qty);
      available.set(id,clean(stock-n)); add(used,id,n);
      if (item.estimate && n > EPS) estimated.add(id);
      return clean(qty-n);
    }
    function make(id,qty) {
      const recipe = byParent.get(id);
      if (!recipe || recipe.status !== 'confirmed') { unknown.set(id,recipe ? 'DRAFT_RECIPE':'MISSING_RECIPE'); return; }
      const batches = Math.ceil((qty-EPS)/recipe.yieldQty);
      for (const line of recipe.lines) {
        const amount=clean(line.qty*batches);
        consume(line.itemId,line.rounding==='ceil' ? Math.ceil(amount-EPS):amount);
      }
      add(produced,id,clean(batches*recipe.yieldQty));
      const stock = available.get(id);
      // A requested target's stock can be unknown when explicitly ignored.
      available.set(id,clean((stock === null ? 0 : stock)+batches*recipe.yieldQty-qty));
    }
    function consume(id,qty) {
      add(required,id,qty);
      const deficit = take(id,qty);
      if (deficit === null || deficit <= EPS) return;
      const item = byId.get(id);
      if (opts.mode === 'recursive' && item.kind === 'semi') make(id,deficit);
      else add(shortages,id,deficit);
    }
    // Reserve finished output for every requested target before component planning.
    const remaining = [];
    for (const [id,qty] of [...demandMap.entries()].sort(([a],[b])=>a.localeCompare(b))) {
      let deficit = qty;
      if (opts.useFinishedStock) deficit=take(id,qty);
      if (deficit !== null && deficit > EPS) remaining.push([id,deficit]);
    }
    for (const [id,qty] of remaining) {
      if (byId.get(id).kind === 'raw') consume(id,qty);
      else make(id,qty);
    }
    const rows = map => [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([itemId,qty])=>({itemId,qty,unit:byId.get(itemId).unit}));
    const issues = [...unknown].map(([itemId,code])=>({itemId,code}));
    const status = issues.length ? 'unknown' : shortages.size ? 'shortage' : estimated.size ? 'estimated' : 'ready';
    return {status,feasible:issues.length ? null : shortages.size===0,issues,shortages:rows(shortages),required:rows(required),used:rows(used),produced:rows(produced),remaining:rows(new Map([...available].filter(([,v])=>v!==null))),estimatedItemIds:[...estimated],mode:opts.mode,reservationsIncluded:true,reservationSource:'manual-only',wholeBatches:true};
  }
  function capacity(items,recipes,itemId,options) {
    const opts={...{mode:'immediate',maxBatches:1000000},...options};
    const model=createModel(items,recipes);
    if(model.issues.length) return {status:'invalid',qty:null,issues:model.issues};
    const item=model.byId.get(itemId),recipe=model.byParent.get(itemId);
    if(!item || item.kind==='raw') return {status:'invalid',qty:null,issues:[{code:'NOT_PRODUCIBLE',itemId}]};
    if(!recipe || recipe.status!=='confirmed') return {status:'unknown',qty:null,issues:[{code:recipe?'DRAFT_RECIPE':'MISSING_RECIPE',itemId}]};
    if(!Number.isSafeInteger(opts.maxBatches)||opts.maxBatches<1) return {status:'invalid',qty:null,issues:[{code:'INVALID_LIMIT'}]};
    const test=n=>plan(items,recipes,[{itemId,qty:clean(n*recipe.yieldQty)}],{mode:opts.mode,useFinishedStock:false});
    const first=test(1);
    if(first.feasible===null) return {status:first.status,qty:null,issues:first.issues};
    if(!first.feasible) return {status:'shortage',qty:0,batches:0,limiting:first.shortages,wholeBatches:true};
    let low=1,high=opts.maxBatches, estimated=first.status==='estimated';
    while(low<high) {
      const mid=Math.ceil((low+high)/2), result=test(mid);
      if(result.feasible===null) { high=mid-1; continue; }
      if(result.feasible) {low=mid;estimated=estimated||result.status==='estimated';} else high=mid-1;
    }
    const result=test(low), next=low<opts.maxBatches ? test(low+1):null;
    return {status:next?.issues?.length?'lower_bound':estimated?'estimated':'ready',qty:clean(low*recipe.yieldQty),batches:low,wholeBatches:true,capped:low===opts.maxBatches,limiting:next?.shortages||[],nextIssues:next?.issues||[],estimatedItemIds:result.estimatedItemIds,mode:opts.mode,reservationsIncluded:true,reservationSource:'manual-only'};
  }
  return Object.freeze({validate:(items,recipes)=>createModel(items,recipes).issues,plan,capacity});
});
