// Vercel Web Analytics - Browser-compatible version
// This script initializes Vercel Analytics for static HTML sites
(function() {
  // Initialize the queue if it doesn't exist
  if (!window.va) {
    window.va = function() {
      (window.vaq = window.vaq || []).push(arguments);
    };
  }
  
  // Inject analytics script
  // The actual tracking script will be loaded from Vercel's CDN
  // when the site is deployed to Vercel
  var mode = 'production';
  
  // Development mode detection
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    mode = 'development';
  }
  
  // Track page view
  window.va('pageview');
  
  console.log('[Vercel Analytics] Initialized in', mode, 'mode');
})();
