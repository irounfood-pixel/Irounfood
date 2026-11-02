const assert=require('node:assert/strict');const {install}=require('../scripts/page_back_guard.js');
(async()=>{
 const listeners={},stack=[{outside:true},null];let pos=1,home=false,overlay=false,prompts=0,confirm=false,exits=[];
 const win={history:{get state(){return stack[pos]},get length(){return stack.length},replaceState(s){stack[pos]=s},pushState(s){stack.splice(++pos);stack[pos]=s},go(n){exits.push(n)}},location:{replace(x){exits.push(x)}},addEventListener(n,f){listeners[n]=f}};
 install({window:win,isHome:()=>home,goHome:()=>{home=true},closeOverlay:()=>{if(overlay){overlay=false;return true}return false},confirmExit:async()=>{prompts++;return confirm}});
 listeners.pointerdown();assert.equal(stack.length,3);listeners.keydown();assert.equal(stack.length,3);
 const back=()=>{pos--;return listeners.popstate({state:stack[pos]})};
 overlay=true;await back();assert.equal(home,false);assert.equal(prompts,0);
 await back();assert.equal(home,true);assert.equal(prompts,0);
 await back();assert.equal(prompts,1);assert.deepEqual(exits,[]);assert.equal(stack.length,3);
 confirm=true;await back();assert.deepEqual(exits,[-2]);
 console.log('PASS: one history buffer, overlay first, internal return home, cancel retains page, confirmed exit');
})();
