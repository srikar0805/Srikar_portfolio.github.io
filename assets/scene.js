/* ------------------------------------------------------------------
   Two WebGL scenes, hand-written with no libraries, so the site stays
   a static page with nothing to install and no CDN to go down.

   #scene  fixed background: drifting starfield, a neon grid floor and
           slowly turning wireframe solids. The camera follows scroll
           and the pointer, so moving through the page moves through space.
   #holo   the hero hologram: a 10,000 point cloud sampled from his
           portrait, with a scan line and orbiting particle rings.
           Drag or use the arrow keys to rotate.
------------------------------------------------------------------ */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = matchMedia("(max-width: 720px)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var CYAN = [0.38, 0.94, 0.86], VIOLET = [0.62, 0.53, 1.0], WHITE = [0.9, 0.95, 1.0];

  /* ---------------- matrices (column-major) ---------------- */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(ex, ey, ez, cx, cy, cz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz, l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    var xx = zz, xy = 0, xz = -zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1]);
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trs(x, y, z, s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1]); }

  /* ---------------- GL plumbing ---------------- */
  function getGL(canvas, alpha) {
    var opts = { alpha: alpha, antialias: true, premultipliedAlpha: true, powerPreference: "high-performance" };
    try { return canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts); } catch (e) { return null; }
  }
  function compile(gl, vs, fs) {
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var prog = { p: p, u: {} };
    var count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) { var info = gl.getActiveUniform(p, i); prog.u[info.name] = gl.getUniformLocation(p, info.name); }
    return prog;
  }
  function buffer(gl, data) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  /* Enable attributes, draw, then disable again so the next program never
     inherits an array it does not declare. */
  function draw(gl, prog, attrs, mode, count) {
    var locs = [];
    for (var i = 0; i < attrs.length; i++) {
      var loc = gl.getAttribLocation(prog.p, attrs[i][0]);
      if (loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, attrs[i][1]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, attrs[i][2], gl.FLOAT, false, 0, 0);
      locs.push(loc);
    }
    gl.drawArrays(mode, 0, count);
    for (var j = 0; j < locs.length; j++) gl.disableVertexAttribArray(locs[j]);
  }

  var POINT_VS = [
    "attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;",
    "uniform mat4 uMVP; uniform float uDPR, uTime, uDrift, uWrap, uScale; uniform vec2 uFog, uNear;",
    "varying vec4 vCol;",
    "void main() {",
    "  vec3 p = aPos;",
    "  if (uWrap > 0.5) p.z = mod(p.z + uDrift + 90.0, 100.0) - 90.0;",
    "  vec4 c = uMVP * vec4(p, 1.0);",
    "  gl_Position = c;",
    "  float w = max(c.w, 0.001);",
    "  float fog = (1.0 - smoothstep(uFog.x, uFog.y, w)) * smoothstep(uNear.x, uNear.y, w);",
    "  float twinkle = 0.7 + 0.3 * sin(uTime * 1.6 + aPos.x * 12.9 + aPos.y * 7.3);",
    "  vCol = vec4(aCol.rgb, aCol.a * fog * twinkle);",
    "  gl_PointSize = min(aSize * uScale * uDPR * 6.0 / w, 28.0);",
    "}"].join("\n");

  var POINT_FS = [
    "precision mediump float;",
    "varying vec4 vCol;",
    "void main() {",
    "  vec2 d = gl_PointCoord - 0.5;",
    "  float r = dot(d, d) * 4.0;",
    "  if (r > 1.0) discard;",
    "  float a = vCol.a * (1.0 - r) * (1.0 - r);",
    "  gl_FragColor = vec4(vCol.rgb * a, a);",
    "}"].join("\n");

  var LINE_VS = [
    "attribute vec3 aPos;",
    "uniform mat4 uMVP; uniform vec2 uFog;",
    "varying float vFog;",
    "void main() {",
    "  vec4 c = uMVP * vec4(aPos, 1.0);",
    "  gl_Position = c;",
    "  vFog = 1.0 - smoothstep(uFog.x, uFog.y, c.w);",
    "}"].join("\n");

  var LINE_FS = [
    "precision mediump float;",
    "uniform vec4 uCol; varying float vFog;",
    "void main() { float a = uCol.a * vFog; gl_FragColor = vec4(uCol.rgb * a, a); }"].join("\n");

  var FACE_VS = [
    "attribute vec3 aPos; attribute vec3 aScatter; attribute vec2 aInfo;",
    "uniform mat4 uMVP; uniform float uE, uTime, uDPR, uScan, uSize;",
    "varying vec4 vCol;",
    "void main() {",
    "  vec3 p = mix(aScatter, aPos, uE);",
    "  vec4 c = uMVP * vec4(p, 1.0);",
    "  gl_Position = c;",
    "  float persp = 3.0 / max(c.w, 0.1);",
    "  float band = exp(-pow((aPos.y - uScan) * 16.0, 2.0));",
    "  vec3 col = mix(vec3(0.38, 0.94, 0.86), vec3(0.95, 0.70, 0.36), aInfo.y);",
    "  col = mix(col, vec3(0.88, 1.0, 0.98), band * 0.55);",
    "  float flicker = 0.9 + 0.1 * sin(uTime * 21.0 + aPos.y * 55.0);",
    "  float a = ((0.30 + aInfo.x * 1.05) * (0.3 + 0.7 * uE) + band * 0.25) * persp * flicker;",
    "  vCol = vec4(col, clamp(a, 0.0, 1.0));",
    "  gl_PointSize = uSize * uDPR * persp * (1.0 + band * 0.6);",
    "}"].join("\n");

  function edges(verts, len) {
    var out = [];
    for (var i = 0; i < verts.length; i++) for (var j = i + 1; j < verts.length; j++) {
      var a = verts[i], b = verts[j];
      if (Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - len) < 1e-3) out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    return new Float32Array(out);
  }
  function ringLines(r, seg) {
    var o = [];
    for (var k = 0; k < seg; k++) {
      var a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      o.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
    }
    return new Float32Array(o);
  }
  function ringPoints(r, n, jitter) {
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, rr = r + (Math.random() - 0.5) * jitter, base = i % 5 === 0 ? VIOLET : CYAN;
      pos.set([Math.cos(a) * rr, (Math.random() - 0.5) * jitter * 0.4, Math.sin(a) * rr], i * 3);
      col.set([base[0], base[1], base[2], 0.35 + Math.random() * 0.5], i * 4);
      size[i] = 0.6 + Math.random() * 0.9;
    }
    return { pos: pos, col: col, size: size, n: n };
  }

  /* A render loop that sleeps while hidden or off screen. */
  function loop(frame, isVisible) {
    var raf = 0;
    function tick(now) { raf = 0; frame(now); if (!reduce && !document.hidden && isVisible()) raf = requestAnimationFrame(tick); }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    document.addEventListener("visibilitychange", kick);
    return kick;
  }

  /* ================= background scene ================= */
  function background() {
    var canvas = document.getElementById("scene");
    if (!canvas) return;
    var gl = getGL(canvas, false);
    if (!gl) { document.documentElement.classList.add("no-webgl"); return; }
    var pts = compile(gl, POINT_VS, POINT_FS), lines = compile(gl, LINE_VS, LINE_FS);
    var bgDPR = Math.min(DPR, 1.5);

    var N = small ? 700 : 1700, sPos = new Float32Array(N * 3), sCol = new Float32Array(N * 4), sSize = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      sPos.set([(Math.random() - 0.5) * 80, (Math.random() - 0.35) * 44, -90 + Math.random() * 100], i * 3);
      var pick = Math.random(), base = pick < 0.55 ? WHITE : pick < 0.8 ? CYAN : VIOLET;
      sCol.set([base[0], base[1], base[2], 0.35 + Math.random() * 0.65], i * 4);
      sSize[i] = 0.6 + Math.pow(Math.random(), 3) * 2.6;
    }
    var stars = [["aPos", buffer(gl, sPos), 3], ["aCol", buffer(gl, sCol), 4], ["aSize", buffer(gl, sSize), 1]];

    var g = [], floorY = -2.2;
    for (var x = -40; x <= 40; x += 2) g.push(x, floorY, -100, x, floorY, 12);
    for (var z = -100; z <= 12; z += 2) g.push(-40, floorY, z, 40, floorY, z);
    var grid = { buf: buffer(gl, new Float32Array(g)), count: g.length / 3 };

    var t = (1 + Math.sqrt(5)) / 2;
    var icoData = edges([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], 2);
    var octData = edges([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], Math.SQRT2);
    var ico = { buf: buffer(gl, icoData), count: icoData.length / 3 };
    var oct = { buf: buffer(gl, octData), count: octData.length / 3 };
    var ring = { buf: buffer(gl, ringLines(1, 120)), count: 240 };

    var W = 1, H = 1, proj = null, px = 0, py = 0, tx = 0, ty = 0, t0 = performance.now();
    addEventListener("pointermove", function (e) { tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });

    /* Solids fade in once the reader scrolls past the hero, so they never sit
       behind the hologram or the headline on first paint. */
    function solid(vp, shape, model, color, fog) {
      var fade = Math.min(1, Math.max(0, (scrollY - innerHeight * 0.3) / (innerHeight * 0.5)));
      if (fade <= 0) return;
      gl.uniformMatrix4fv(lines.u.uMVP, false, mul(vp, model));
      gl.uniform4fv(lines.u.uCol, [color[0], color[1], color[2], color[3] * fade]);
      gl.uniform2fv(lines.u.uFog, fog || [30, 90]);
      draw(gl, lines, [["aPos", shape.buf, 3]], gl.LINES, shape.count);
    }

    function frame(now) {
      var time = (now - t0) / 1000, max = document.documentElement.scrollHeight - innerHeight;
      var sp = max > 0 ? Math.min(1, scrollY / max) : 0;
      px += (tx - px) * 0.04; py += (ty - py) * 0.04;
      var view = lookAt(px * 0.9, 0.5 - py * 0.5 - sp * 1.4, 7 - sp * 5, px * 0.3, -0.2 - sp * 1.8, -12);
      var vp = mul(proj, view), motion = reduce ? 0 : time;

      gl.clearColor(0.016, 0.024, 0.043, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      gl.useProgram(lines.p);
      solid(vp, grid, trs(0, 0, (motion * 1.4 + scrollY * 0.02) % 2, 1), [0.38, 0.94, 0.86, 0.17], [6, 70]);

      /* On narrow screens the hologram sits at the top, so the solids drop low and far to stay clear of it. */
      var wide = W / H > 1.05, ax = wide ? 6.4 : 3.2, ay = wide ? 1.4 : -1.0, az = wide ? -9 : -15;
      solid(vp, ico, mul(trs(ax, ay, az, 1.35), mul(rotY(motion * 0.16), rotX(motion * 0.11))), [0.38, 0.94, 0.86, 0.55]);
      solid(vp, ico, mul(trs(ax, ay, az, 0.55), mul(rotY(-motion * 0.3), rotZ(motion * 0.2))), [0.62, 0.53, 1.0, 0.5]);
      solid(vp, ring, mul(trs(ax, ay, az, 2.7), mul(rotX(0.45 + Math.sin(motion * 0.3) * 0.12), rotY(motion * 0.2))), [0.62, 0.53, 1.0, 0.35]);
      solid(vp, ring, mul(trs(ax, ay, az, 3.3), mul(rotZ(0.9), rotX(1.2 + motion * 0.05))), [0.38, 0.94, 0.86, 0.2]);
      solid(vp, oct, mul(trs(-8.5, 3.6, -24, 1.8), mul(rotY(motion * 0.12), rotX(0.4))), [0.62, 0.53, 1.0, 0.5], [30, 110]);
      solid(vp, oct, mul(trs(-5.2, -0.9, -6, 0.42), mul(rotY(-motion * 0.5), rotZ(motion * 0.3))), [0.38, 0.94, 0.86, 0.45]);

      gl.useProgram(pts.p);
      gl.uniformMatrix4fv(pts.u.uMVP, false, vp);
      gl.uniform1f(pts.u.uDPR, bgDPR);
      gl.uniform1f(pts.u.uTime, motion);
      gl.uniform1f(pts.u.uDrift, motion * 2.2 + scrollY * 0.03);
      gl.uniform1f(pts.u.uWrap, 1);
      gl.uniform1f(pts.u.uScale, 1);
      gl.uniform2fv(pts.u.uFog, [20, 95]);
      gl.uniform2fv(pts.u.uNear, [0.4, 2.5]);
      draw(gl, pts, stars, gl.POINTS, N);
    }

    var kick = loop(frame, function () { return true; });
    function resize() {
      W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(W * bgDPR); canvas.height = Math.round(H * bgDPR);
      gl.viewport(0, 0, canvas.width, canvas.height);
      proj = perspective(55 * Math.PI / 180, W / H, 0.1, 200);
      kick();
    }
    addEventListener("resize", resize);
    if (reduce) addEventListener("scroll", kick, { passive: true });
    resize();
  }

  /* ================= hero hologram ================= */
  function hologram() {
    var canvas = document.getElementById("holo"), data = window.FACE_POINTS;
    if (!canvas || !data) return;
    var gl = getGL(canvas, true);
    if (!gl) return;
    var face = compile(gl, FACE_VS, POINT_FS), pts = compile(gl, POINT_VS, POINT_FS);

    /* 4 bytes per point: x, y, z, then edge strength in the low 7 bits and a
       highlight flag in the top bit. Canvas y runs down and depth runs away
       from the viewer, so both flip for GL. Phones keep every other point. */
    var M = data.meta, raw = atob(data.data), step = small ? 2 : 1, N = Math.floor(M.n / step);
    var pos = new Float32Array(N * 3), scat = new Float32Array(N * 3), info = new Float32Array(N * 2);
    var seed = 1337;
    function rnd() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < N; i++) {
      var o = i * step * 4, b = raw.charCodeAt(o + 3);
      pos[i * 3] = M.x0 + raw.charCodeAt(o) / 255 * M.xs;
      pos[i * 3 + 1] = -(M.y0 + raw.charCodeAt(o + 1) / 255 * M.ys);
      pos[i * 3 + 2] = -(M.z0 + raw.charCodeAt(o + 2) / 255 * M.zs);
      info[i * 2] = (b & 127) / 127; info[i * 2 + 1] = b >> 7;
      scat.set([(rnd() - 0.5) * 3.4, (rnd() - 0.5) * 3.4, (rnd() - 0.5) * 2.2], i * 3);
    }
    var faceAttrs = [["aPos", buffer(gl, pos), 3], ["aScatter", buffer(gl, scat), 3], ["aInfo", buffer(gl, info), 2]];
    function ringAttrs(r) { return { a: [["aPos", buffer(gl, r.pos), 3], ["aCol", buffer(gl, r.col), 4], ["aSize", buffer(gl, r.size), 1]], n: r.n }; }
    var base = ringAttrs(ringPoints(0.62, 260, 0.05)), orbit = ringAttrs(ringPoints(0.8, 170, 0.03));

    var W = 1, H = 1, proj = null, view = lookAt(0, 0, 3.0, 0, -0.06, 0), t0 = performance.now();
    var yaw = 0, targetYaw = 0, pitch = 0.04, freeYaw = 0, dragging = false, lastX = 0, lastY = 0, visible = true;

    function rings(vp, ms) {
      gl.useProgram(pts.p);
      gl.uniform1f(pts.u.uDPR, DPR); gl.uniform1f(pts.u.uTime, ms); gl.uniform1f(pts.u.uDrift, 0);
      gl.uniform1f(pts.u.uWrap, 0); gl.uniform1f(pts.u.uScale, 1);
      gl.uniform2fv(pts.u.uFog, [50, 100]); gl.uniform2fv(pts.u.uNear, [0, 0.001]);
      gl.uniformMatrix4fv(pts.u.uMVP, false, mul(vp, mul(trs(0, -0.8, 0, 1), rotY(ms * 0.45))));
      draw(gl, pts, base.a, gl.POINTS, base.n);
      gl.uniformMatrix4fv(pts.u.uMVP, false, mul(vp, mul(rotY(yaw * 0.6), mul(rotX(1.2), rotZ(ms * 0.35)))));
      draw(gl, pts, orbit.a, gl.POINTS, orbit.n);
    }

    function frame(now) {
      var ms = reduce ? 0 : now / 1000, t = Math.min(1, (now - t0 - 200) / 2100);
      var e = reduce ? 1 : t < 0 ? 0 : 1 - Math.pow(1 - t, 3);
      /* Sway rather than spin: a portrait cloud only reads from near frontal. */
      if (!dragging && !reduce) {
        targetYaw = freeYaw + Math.sin(ms * 0.34) * 0.3 + Math.sin(ms * 0.13) * 0.09;
        pitch += ((Math.sin(ms * 0.21) * 0.055 + 0.02) - pitch) * 0.04;
      }
      yaw += (targetYaw - yaw) * (reduce ? 1 : 0.075);
      var vp = mul(proj, view);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      gl.useProgram(face.p);
      gl.uniformMatrix4fv(face.u.uMVP, false, mul(vp, mul(rotX(pitch), rotY(yaw))));
      gl.uniform1f(face.u.uE, e);
      gl.uniform1f(face.u.uTime, ms);
      gl.uniform1f(face.u.uDPR, DPR);
      gl.uniform1f(face.u.uScan, reduce ? 9 : (ms * 0.32) % 1.9 - 0.95);
      gl.uniform1f(face.u.uSize, small ? 2.9 : 2.6);
      draw(gl, face, faceAttrs, gl.POINTS, N);
      rings(vp, ms);
    }

    var kick = loop(frame, function () { return visible; });
    function resize() {
      W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      gl.viewport(0, 0, canvas.width, canvas.height);
      proj = perspective(32 * Math.PI / 180, W / H, 0.1, 20);
      kick();
    }
    addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) kick(); }).observe(canvas);
    }

    var hint = document.querySelector(".holo-hud .br");
    function hideHint() { if (hint) hint.style.opacity = "0"; }
    canvas.addEventListener("pointerdown", function (ev) {
      dragging = true; lastX = ev.clientX; lastY = ev.clientY; hideHint();
      if (canvas.setPointerCapture) canvas.setPointerCapture(ev.pointerId);
      kick();
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      freeYaw += (ev.clientX - lastX) * 0.0075;
      targetYaw = freeYaw;
      pitch = Math.max(-0.42, Math.min(0.42, pitch + (ev.clientY - lastY) * 0.0035));
      lastX = ev.clientX; lastY = ev.clientY;
      kick();
    });
    function release() { dragging = false; freeYaw *= 0.5; kick(); }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("keydown", function (ev) {
      var d = { ArrowLeft: -0.25, ArrowRight: 0.25 }[ev.key];
      if (d === undefined) return;
      ev.preventDefault(); freeYaw += d; targetYaw = freeYaw; hideHint(); kick();
    });
    resize();
  }

  try { background(); } catch (err) { document.documentElement.classList.add("no-webgl"); console.warn(err); }
  try { hologram(); } catch (err) { console.warn(err); }
})();
