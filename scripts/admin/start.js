// Register authentication and start only after every feature has loaded.
db.auth.onAuthStateChange((_event,session)=>{if(session){$('login').classList.add('hidden');$('app').classList.remove('hidden');renderNav();if(!state.loading) init();}else{$('app').classList.add('hidden');$('login').classList.remove('hidden');}});
showApp();
