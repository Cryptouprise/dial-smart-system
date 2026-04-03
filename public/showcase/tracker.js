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
  if (path.includes('blog-index')) page = 'blog-index';
  else if (path.includes('blog.html')) page = 'blog-post';
  else if (path.includes('landing')) page = 'landing';
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

  // --- NAV ENHANCEMENTS ---
  // 1. Add "← Hub" link before the logo on all showcase sub-pages (not hub itself)
  if (page !== 'hub' && page !== 'demo' && page !== 'unknown' && page !== 'blog-index') {
    var navInner = document.querySelector('nav .inner');
    if (navInner) {
      var hubLink = document.createElement('a');
      // Blog posts link back to blog index; other pages link to hub
      hubLink.href = (page === 'blog-post') ? '/showcase/blog-index.html' : '/showcase/';
      hubLink.textContent = (page === 'blog-post') ? '← Blog' : '← Hub';
      hubLink.style.cssText = 'font-family:"Space Mono",monospace;font-size:11px;letter-spacing:1px;color:#64748b;text-decoration:none;margin-right:16px;transition:color 0.2s;white-space:nowrap';
      hubLink.addEventListener('mouseenter', function(){ this.style.color='#00f0ff'; });
      hubLink.addEventListener('mouseleave', function(){ this.style.color='#64748b'; });
      navInner.insertBefore(hubLink, navInner.firstChild);
    }

    // 2. Add "next page" + "prev page" breadcrumb hints at bottom of each page
    var pageOrder = ['problem', 'engines', 'compare', 'roi'];
    var pageNames = { problem: 'The Problem', engines: '7 Engines', compare: 'Comparison', roi: 'ROI Calculator' };
    var idx = pageOrder.indexOf(page);
    
    if (idx !== -1) {
      var breadcrumb = document.createElement('div');
      breadcrumb.style.cssText = 'position:relative;z-index:2;background:rgba(11,16,32,0.95);border-top:1px solid #1e2d45;padding:20px 0';
      var inner = document.createElement('div');
      inner.style.cssText = 'max-width:1100px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px';
      
      if (idx > 0) {
        var prev = pageOrder[idx - 1];
        var prevLink = document.createElement('a');
        prevLink.href = '/showcase/' + prev + '.html';
        prevLink.innerHTML = '← ' + pageNames[prev];
        prevLink.style.cssText = 'color:#64748b;text-decoration:none;font-size:13px;font-family:"Space Mono",monospace;letter-spacing:1px;transition:color 0.2s';
        prevLink.addEventListener('mouseenter', function(){ this.style.color='#00f0ff'; });
        prevLink.addEventListener('mouseleave', function(){ this.style.color='#64748b'; });
        inner.appendChild(prevLink);
      } else {
        var spacer = document.createElement('div');
        inner.appendChild(spacer);
      }

      // Page position indicator
      var pos = document.createElement('span');
      pos.textContent = (idx + 1) + ' / ' + pageOrder.length;
      pos.style.cssText = 'font-family:"Space Mono",monospace;font-size:10px;color:#1e2d45;letter-spacing:2px';
      inner.appendChild(pos);

      if (idx < pageOrder.length - 1) {
        var next = pageOrder[idx + 1];
        var nextLink = document.createElement('a');
        nextLink.href = '/showcase/' + next + '.html';
        nextLink.innerHTML = pageNames[next] + ' →';
        nextLink.style.cssText = 'color:#00f0ff;text-decoration:none;font-size:13px;font-family:"Space Mono",monospace;letter-spacing:1px;font-weight:700;transition:color 0.2s';
        nextLink.addEventListener('mouseenter', function(){ this.style.color='#fff'; });
        nextLink.addEventListener('mouseleave', function(){ this.style.color='#00f0ff'; });
        inner.appendChild(nextLink);
      }

      breadcrumb.appendChild(inner);
      // Insert before footer
      var footer = document.querySelector('footer');
      if (footer) {
        footer.parentNode.insertBefore(breadcrumb, footer);
      }
    }
  }

  // --- DEMO CTA BAR ---
  // Inject demo CTA bar on showcase pages (not hub, not demo)
  if (page !== 'hub' && page !== 'demo' && page !== 'unknown') {
    var bar = document.createElement('div');
    bar.id = 'demo-cta-bar';
    bar.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div style="display:flex;flex-direction:column;gap:2px">' +
      '<span style="font-size:13px;color:#e2e8f0">✅ <strong>Seen and learned enough?</strong> Watch it all come to life in a live simulation.</span>' +
      '<span style="font-size:10px;color:#64748b;letter-spacing:0.5px">All simulation data is based on real results from 2+ years and dozens of industries — nothing is made up.</span>' +
      '</div>' +
      '<a href="/demo" style="background:#00f0ff;color:#000;padding:8px 20px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));white-space:nowrap">See It In Action →</a>' +
      '</div>';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:rgba(11,16,32,0.95);backdrop-filter:blur(20px);border-top:1px solid #1e2d45;padding:12px 0;';
    
    // Don't show if they already did the demo
    if (!data.demoCompleted) {
      document.body.appendChild(bar);
      document.body.style.paddingBottom = '64px';
    }
  }
})();
