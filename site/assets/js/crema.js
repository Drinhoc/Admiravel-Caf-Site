/* Texturas de crema de café em WebGL: um fundo animado (canvas.crema-live) e "placas" estáticas (.plate[data-tone]). */
(function () {
  var PALETTES = {
    crema:   ['#1E0A08', '#6E3219', '#C08B4E', '#EED6AE'],
    vinho:   ['#16050A', '#45121E', '#88353C', '#C9A56B'],
    grao:    ['#0E0807', '#2E1B14', '#5E3B29', '#A88054'],
    leite:   ['#3B1D14', '#9A6440', '#DDBB8E', '#F6EADA'],
    noite:   ['#0B0607', '#22100F', '#4B1622', '#8C6C3C']
  };
  var FS = [
    'precision highp float;',
    'uniform vec2 r; uniform float t; uniform float seed; uniform float zoom;',
    'uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/r; vec2 p=(gl_FragCoord.xy-.5*r)/min(r.x,r.y)*zoom+seed;',
    ' vec2 q=vec2(fbm(p+.03*t),fbm(p+vec2(5.2,1.3)-.02*t));',
    ' vec2 s=vec2(fbm(p+3.5*q+vec2(1.7,9.2)+.04*t),fbm(p+3.5*q+vec2(8.3,2.8)+.03*t));',
    ' float f=fbm(p+3.5*s);',
    ' vec3 col=mix(c1,c2,clamp(f*f*3.2,0.,1.));',
    ' col=mix(col,c3,clamp(length(q)*.55*f,0.,1.));',
    ' col=mix(col,c4,smoothstep(.62,.95,f*length(s)));',
    ' float vein=smoothstep(.035,0.,abs(fract(f*7.+length(s))-.5)-.46);',
    ' col+=vein*.06*c4;',
    ' float v=smoothstep(1.25,.25,length(uv-.5)*1.6); col*=mix(.55,1.,v);',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');
  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  function hex(c) { return [1, 3, 5].map(function (i) { return parseInt(c.substr(i, 2), 16) / 255; }); }

  function setup(canvas) {
    var gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var u = {}; ['r', 't', 'seed', 'zoom', 'c1', 'c2', 'c3', 'c4'].forEach(function (k) { u[k] = gl.getUniformLocation(pr, k); });
    return {
      gl: gl,
      draw: function (w, hgt, time, tone, seed, zoom) {
        canvas.width = w; canvas.height = hgt; gl.viewport(0, 0, w, hgt);
        var pal = PALETTES[tone] || PALETTES.crema;
        gl.uniform2f(u.r, w, hgt); gl.uniform1f(u.t, time); gl.uniform1f(u.seed, seed); gl.uniform1f(u.zoom, zoom);
        ['c1', 'c2', 'c3', 'c4'].forEach(function (k, i) { var c = hex(pal[i]); gl.uniform3f(u[k], c[0], c[1], c[2]); });
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* placas estáticas */
  var off = document.createElement('canvas');
  var R = setup(off);
  if (R) {
    document.querySelectorAll('.plate').forEach(function (el, i) {
      var tone = el.getAttribute('data-tone') || 'crema';
      var seed = parseFloat(el.getAttribute('data-seed') || (i * 3.7 + 1));
      var zoom = parseFloat(el.getAttribute('data-zoom') || '2.2');
      var box = el.getBoundingClientRect();
      var ar = box.width && box.height ? box.width / box.height : 0.8;
      var W = 640, H = Math.round(W / ar);
      if (H > 900) { H = 900; W = Math.round(H * ar); }
      R.draw(W, H, 0, tone, seed, zoom);
      el.style.backgroundImage = 'url(' + off.toDataURL('image/jpeg', 0.86) + ')';
    });
  }

  /* fundos animados */
  document.querySelectorAll('canvas.crema-live').forEach(function (cv) {
    var L = setup(cv); if (!L) return;
    var tone = cv.getAttribute('data-tone') || 'vinho';
    var seed = parseFloat(cv.getAttribute('data-seed') || '2');
    var zoom = parseFloat(cv.getAttribute('data-zoom') || '1.8');
    var start = performance.now(), visible = true;
    function size() { var b = cv.getBoundingClientRect(); return [Math.max(2, Math.round(b.width * 0.6)), Math.max(2, Math.round(b.height * 0.6))]; }
    function frame(now) {
      var s = size();
      L.draw(s[0], s[1], reduce ? 0 : (now - start) / 1000 * 0.6, tone, seed, zoom);
      if (!reduce && visible) requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var was = visible; visible = es[0].isIntersecting;
        if (visible && !was && !reduce) requestAnimationFrame(frame);
      }).observe(cv);
    }
    requestAnimationFrame(frame);
    window.addEventListener('resize', function () { if (reduce) requestAnimationFrame(frame); });
  });
})();
