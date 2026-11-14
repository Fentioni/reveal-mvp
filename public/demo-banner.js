// Applies ONLY to the temporary demonstration site; never packaged with the
// actual paid Reveal Worker. No checkout or private details are submitted.
(() => {
  const banner=document.createElement('aside');
  banner.textContent='QUEST PREVIEW — SAMPLE PUZZLES ONLY · NO PURCHASES';
  Object.assign(banner.style,{
    position:'relative',zIndex:'30',textAlign:'center',padding:'11px 12px',
    background:'#25190e',color:'#f4dcae',borderBottom:'1px solid #ad8551',
    font:'600 11px/1.4 system-ui,sans-serif',letterSpacing:'.08em'
  });
  document.body.prepend(banner);
  document.addEventListener('submit',event=>{
    if(event.target?.id==='creatorForm'){
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('This is a sample-only visual preview. No purchases or personal data are submitted here.');
    }
  },true);
})();
