/* One back-buffer entry: inner screens return home; home asks before exit. */
(function(root){
 function install(options){
  const win=options.window||root,history=win.history,key='irounBackGuardV1';
  let armed=false,leaving=false,canLeave=false,pending=false;
  const arm=()=>{
   if(armed||leaving)return;
   const saved=history.state?.[key];
   if(saved?.guard){canLeave=saved.canLeave;armed=true;return;}
   canLeave=history.length>1;
   history.replaceState({...history.state,[key]:{base:true,canLeave}},'');
   history.pushState({[key]:{guard:true,canLeave}},'');armed=true;
  };
  win.addEventListener('pointerdown',arm,{once:true});
  win.addEventListener('keydown',arm,{once:true});
  if(history.state?.[key]?.guard)arm();
  win.addEventListener('popstate',async event=>{
   if(leaving||!armed||!event.state?.[key]?.base)return;
   history.pushState({[key]:{guard:true,canLeave}},'');
   if(pending)return;
   if(options.closeOverlay?.())return;
   if(!options.isHome()){options.goHome();return;}
   pending=true;let confirmed;
   try{confirmed=await options.confirmExit();}finally{pending=false;}
   if(!confirmed)return;
   leaving=true;
   if(canLeave)history.go(-2);else win.location.replace('about:blank');
  });
 }
 root.IrounBackGuard={install};
 if(typeof module==='object')module.exports={install};
})(typeof window==='object'?window:globalThis);
