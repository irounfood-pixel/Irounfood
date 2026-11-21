let exitPagePromise=null;
function confirmExitPage(){
 if(exitPagePromise)return exitPagePromise;
 const dialog=document.getElementById('exitPageDialog');
 exitPagePromise=new Promise(resolve=>{
  const finish=value=>{dialog.close();exitPagePromise=null;resolve(value);};
  document.getElementById('exitPageCancel').onclick=()=>finish(false);
  document.getElementById('exitPageLeave').onclick=()=>finish(true);
  dialog.oncancel=e=>{e.preventDefault();finish(false);};
  dialog.showModal();
 });return exitPagePromise;
}
IrounBackGuard.install({isHome:()=>state.page==='dashboard',goHome:()=>route('dashboard'),confirmExit:confirmExitPage,
 closeOverlay:()=>{if(!$('modal').classList.contains('hidden')){closeModal();return true;}return false;}});
