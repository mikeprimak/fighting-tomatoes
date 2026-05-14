(function () {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    var params = new URLSearchParams(location.search);
    var src = params.get('utm_source');
    var med = params.get('utm_medium');
    var camp = params.get('utm_campaign');
    var content = params.get('utm_content');
    var term = params.get('utm_term');
    if (!src && !med && !camp && !content && !term) return;

    var refParts = [];
    if (src) refParts.push('utm_source=' + encodeURIComponent(src));
    if (med) refParts.push('utm_medium=' + encodeURIComponent(med));
    if (camp) refParts.push('utm_campaign=' + encodeURIComponent(camp));
    if (content) refParts.push('utm_content=' + encodeURIComponent(content));
    if (term) refParts.push('utm_term=' + encodeURIComponent(term));
    var playReferrer = refParts.join('&');

    var ct = ((camp || src || '') + '').slice(0, 100);

    document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        if (ct) u.searchParams.set('ct', ct);
        a.href = u.toString();
      } catch (e) {}
    });

    document.querySelectorAll('a[href*="play.google.com"]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        u.searchParams.set('referrer', playReferrer);
        a.href = u.toString();
      } catch (e) {}
    });
  });
})();
