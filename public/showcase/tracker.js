// Call Boss Visitor Tracking — include on all showcase pages + demo
(function(){
  var key = 'callboss_visitor';
  var data = JSON.parse(localStorage.getItem(key) || '{}');
  
  // Track page visit
  data.visits = (data.visits || 0) + 1;
  data.lastVisit = new Date().toISOString();
  data.pagesVisited = data.pagesVisited || [];
  
  // Detect current page
  var path = window.location.pathname;
  var page = 'unknown';
  if (path.includes('landing')) page = 'landing';
  else if (path.includes('problem')) page = 'problem';
  else if (path.includes('engines')) page = 'engines';
  else if (path.includes('compare')) page = 'compare';
  else if (path.includes('roi')) page = 'roi';
  else if (path.includes('demo')) page = 'demo';
  else if (path.includes('showcase')) page = 'hub';
  
  if (data.pagesVisited.indexOf(page) === -1) {
    data.pagesVisited.push(page);
  }
  
  localStorage.setItem(key, JSON.stringify(data));
  
  // Inject demo CTA bar on showcase pages (not hub, not demo)
  if (page !== 'hub' && page !== 'demo' && page !== 'unknown') {
    var bar = document.createElement('div');
    bar.id = 'demo-cta-bar';
    bar.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<span style="font-size:13px;color:#e2e8f0">🚀 Want to see it work? <strong>Try the interactive demo</strong></span>' +
      '<a href="/demo" style="background:#00f0ff;color:#000;padding:8px 20px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))">See It In Action →</a>' +
      '</div>';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:rgba(11,16,32,0.95);backdrop-filter:blur(20px);border-top:1px solid #1e2d45;padding:12px 0;';
    
    // Don't show if they already did the demo
    if (!data.demoCompleted) {
      document.body.appendChild(bar);
      document.body.style.paddingBottom = '56px';
    }
  }
})();
