/* ============================================================
   MOCKDOCK ??? script.js
   Two-step form, JSON schema paste, JSON record paste,
   multi-resource support, output rendering, inline API tester
   ============================================================ */

// ---- State ----
var state = {
  authEnabled: false,
  namespaceDraft: '',
  namespaceAvailable: null,
  namespaceCheckToken: 0,
  outputPollIntervalId: null,
  namespace: null,
  resource: null,
  route: null,
  schema: null,
  resources: [],            // completed resources [{name, route_path, schema}]
  currentResourceIndex: null,
  auth: null,
  endpointData: null
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  setupNamespaceAvailability();
  setupRoutePreview();
  renderRoutePreview();
  document.getElementById('input-route').addEventListener('input', function () {
    if (state.authEnabled) updateProtectedRoutesList();
  });
});

// ============================================================
// SCHEMA VALIDATION
// ============================================================
var VALID_PLAIN_TYPES = ['string', 'integer', 'number', 'boolean'];

function getSchema() {
  var raw = document.getElementById('schema-json-input').value.trim();
  var statusEl = document.getElementById('json-parse-status');

  if (!raw) {
    statusEl.textContent = '';
    showStep1Error('Paste a JSON schema.');
    return null;
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    statusEl.textContent = '??? Invalid JSON: ' + e.message;
    statusEl.style.color = 'var(--red)';
    showStep1Error('Schema: invalid JSON ??? ' + e.message);
    return null;
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    showStep1Error('Schema must be a JSON object.');
    return null;
  }

  var keys = Object.keys(parsed);
  if (keys.length === 0) {
    showStep1Error('Schema must have at least one field.');
    return null;
  }

  for (var i = 0; i < keys.length; i++) {
    var fieldName = keys[i];
    var fieldDef = parsed[fieldName];

    if (typeof fieldDef === 'string') {
      if (VALID_PLAIN_TYPES.indexOf(fieldDef) === -1) {
        showStep1Error('field "' + fieldName + '": invalid type definition');
        return null;
      }
    } else if (typeof fieldDef === 'object' && fieldDef !== null && !Array.isArray(fieldDef)) {
      if ('enum' in fieldDef) {
        var enumVals = fieldDef['enum'];
        if (!Array.isArray(enumVals) || enumVals.length === 0 ||
            !enumVals.every(function (v) { return typeof v === 'string'; })) {
          showStep1Error('field "' + fieldName + '": invalid type definition');
          return null;
        }
      } else if ('type' in fieldDef && 'format' in fieldDef) {
        if (fieldDef['type'] !== 'string' || fieldDef['format'] !== 'email') {
          showStep1Error('field "' + fieldName + '": invalid type definition');
          return null;
        }
      } else {
        showStep1Error('field "' + fieldName + '": invalid type definition');
        return null;
      }
    } else {
      showStep1Error('field "' + fieldName + '": invalid type definition');
      return null;
    }
  }

  statusEl.textContent = '??? Valid';
  statusEl.style.color = 'var(--green)';
  return parsed;
}

// ============================================================
// RECORDS VALIDATION ??? per resource index
// ============================================================
function getRecordsForIndex(index) {
  var ta = document.getElementById('records-json-input-' + index);
  if (!ta) return null;
  var raw = ta.value.trim();

  if (!raw) {
    showStep2Error('Resource ' + (index + 1) + ': paste at least one record.');
    return null;
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    showStep2Error('Resource ' + (index + 1) + ': invalid JSON ??? ' + e.message);
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    showStep2Error('Resource ' + (index + 1) + ': records must be a non-empty array.');
    return null;
  }

  for (var i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || parsed[i] === null) {
      showStep2Error('Resource ' + (index + 1) + ': each record must be an object.');
      return null;
    }
  }

  return parsed;
}

// ============================================================
// MULTI-RESOURCE ??? save current form, add to list
// ============================================================
function saveCurrentResource() {
  var resource = document.getElementById('input-resource').value.trim();
  if (!resource) { showStep1Error('Resource name is required.'); return null; }

  var route = document.getElementById('input-route').value.trim();
  if (!route) { showStep1Error('Route path is required.'); return null; }
  if (!route.startsWith('/')) { showStep1Error('Route path must start with /'); return null; }

  var schema = getSchema();
  if (!schema) return null;

  return { name: resource, route_path: route, schema: schema };
}

function saveAndAddResource() {
  var res = saveCurrentResource();
  if (!res) return;

  state.resources.push(res);
  renderResourceList();

  // Clear form for new resource
  document.getElementById('input-resource').value = '';
  document.getElementById('input-route').value = '';
  document.getElementById('schema-json-input').value = '';
  document.getElementById('json-parse-status').textContent = '';
  document.getElementById('resource-form-label').textContent =
    'Resource ' + (state.resources.length + 1);

  renderRoutePreview();
}

function renderResourceList() {
  var container = document.getElementById('resource-list');
  container.innerHTML = '';
  state.resources.forEach(function (r, i) {
    var card = document.createElement('div');
    card.className = 'resource-card';

    var info = document.createElement('div');
    info.style.flex = '1';

    var namEl = document.createElement('span');
    namEl.className = 'resource-card-name';
    namEl.textContent = r.name;

    var metaEl = document.createElement('span');
    metaEl.className = 'resource-card-meta';
    var fieldCount = Object.keys(r.schema).length;
    metaEl.textContent = r.route_path + ' ?? ' + fieldCount + ' field' + (fieldCount !== 1 ? 's' : '');

    info.appendChild(namEl);
    info.appendChild(metaEl);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.innerHTML = '??';
    removeBtn.title = 'Remove resource';
    (function (idx) {
      removeBtn.onclick = function () {
        state.resources.splice(idx, 1);
        renderResourceList();
        document.getElementById('resource-form-label').textContent =
          'Resource ' + (state.resources.length + 1);
      };
    }(i));

    card.appendChild(info);
    card.appendChild(removeBtn);
    container.appendChild(card);
  });
}

// ============================================================
// STEP 1 ??? AUTH TOGGLE
// ============================================================
function toggleAuth() {
  state.authEnabled = document.getElementById('auth-toggle').checked;
  document.getElementById('auth-config').classList.toggle('hidden', !state.authEnabled);
  if (state.authEnabled) updateProtectedRoutesList();
}

function updateProtectedRoutesList() {
  var route = document.getElementById('input-route').value.trim();
  var container = document.getElementById('protected-routes-list');
  container.innerHTML = '';
  if (!route) return;

  var label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '8px';
  label.style.fontFamily = 'var(--mono)';
  label.style.fontSize = '0.8rem';
  label.style.color = 'var(--text)';
  label.style.marginTop = '4px';

  var cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.value = route;
  cb.checked = true;
  cb.id = 'protect-route-cb';

  label.appendChild(cb);
  label.appendChild(document.createTextNode(route));
  container.appendChild(label);
}

// ============================================================
// STEP 1 - LIVE ROUTE PREVIEW
// ============================================================
function setupRoutePreview() {
  ['input-namespace', 'input-resource', 'input-route'].forEach(function (id) {
    var element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('input', renderRoutePreview);
  });
}

function renderRoutePreview() {
  var namespaceInput = document.getElementById('input-namespace');
  var resourceInput = document.getElementById('input-resource');
  var routeInput = document.getElementById('input-route');
  var routePathEl = document.getElementById('preview-route-path');
  var endpointsEl = document.getElementById('preview-endpoints');

  var namespaceValue = namespaceInput ? namespaceInput.value.trim() : '';
  var resourceValue = resourceInput ? resourceInput.value.trim() : '';
  var routeValue = routeInput ? routeInput.value.trim() : '';

  var namespaceSlug = namespaceValue || '{namespace}';
  var resourceSlug = resourceValue || '{resource}';
  var routePreview = routeValue || '/api/{resource}';
  var basePath = '/' + namespaceSlug + '/' + resourceSlug;

  routePathEl.textContent = routePreview;

  var endpoints = [
    { method: 'GET',    path: basePath,          note: 'list all' },
    { method: 'GET',    path: basePath + '/:id',  note: 'get one' },
    { method: 'POST',   path: basePath,          note: 'create' },
    { method: 'PUT',    path: basePath + '/:id',  note: 'update' },
    { method: 'DELETE', path: basePath + '/:id',  note: 'delete' }
  ];

  endpointsEl.innerHTML = '';
  endpoints.forEach(function (endpoint, index) {
    var item = document.createElement('div');
    item.className = 'endpoint-item';
    if (index === endpoints.length - 1) item.classList.add('preview-endpoint-last');

    var row = document.createElement('div');
    row.className = 'endpoint-row';

    var methodBadge = document.createElement('span');
    methodBadge.className = 'endpoint-method method-' + endpoint.method.toLowerCase();
    methodBadge.textContent = endpoint.method;

    var pathSpan = document.createElement('span');
    pathSpan.className = 'endpoint-url';
    pathSpan.textContent = endpoint.path;

    var noteSpan = document.createElement('span');
    noteSpan.className = 'preview-endpoint-note';
    noteSpan.textContent = endpoint.note;

    row.appendChild(methodBadge);
    row.appendChild(pathSpan);
    row.appendChild(noteSpan);
    item.appendChild(row);
    endpointsEl.appendChild(item);
  });
}

// ============================================================
// STEP 1 - NAMESPACE AVAILABILITY
// ============================================================
function setupNamespaceAvailability() {
  var namespaceInput = document.getElementById('input-namespace');
  var randomizeBtn = document.getElementById('namespace-randomize');
  var debouncedCheck = debounce(function () {
    checkNamespaceAvailability(namespaceInput.value);
  }, 400);

  namespaceInput.addEventListener('input', function () {
    state.namespaceDraft = namespaceInput.value.trim();
    debouncedCheck();
  });

  randomizeBtn.addEventListener('click', function () {
    var base = namespaceInput.value.trim() || 'mockdock';
    namespaceInput.value = base + '-' + randomSuffix(4);
    state.namespaceDraft = namespaceInput.value.trim();
    checkNamespaceAvailability(namespaceInput.value);
  });
}

function checkNamespaceAvailability(rawSlug) {
  var slug = (rawSlug || '').trim();
  var indicator = document.getElementById('namespace-availability');
  var randomizeBtn = document.getElementById('namespace-randomize');

  if (!slug) {
    state.namespaceAvailable = null;
    indicator.textContent = '';
    indicator.style.color = '';
    randomizeBtn.classList.add('hidden');
    return;
  }

  var requestToken = ++state.namespaceCheckToken;
  indicator.textContent = 'checking...';
  indicator.style.color = '';

  fetch('/' + encodeURIComponent(slug) + '/check')
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (res) {
      if (requestToken !== state.namespaceCheckToken) return;

      if (!res.ok) {
        throw new Error(res.data.error || 'Unable to check namespace.');
      }

      state.namespaceAvailable = !!res.data.available;
      if (state.namespaceAvailable) {
        indicator.textContent = 'available';
        indicator.style.color = 'var(--green)';
        randomizeBtn.classList.add('hidden');
      } else {
        indicator.textContent = 'taken';
        indicator.style.color = 'var(--red)';
        randomizeBtn.classList.remove('hidden');
      }
    })
    .catch(function () {
      if (requestToken !== state.namespaceCheckToken) return;
      state.namespaceAvailable = null;
      indicator.textContent = '';
      indicator.style.color = '';
      randomizeBtn.classList.add('hidden');
    });
}

function debounce(fn, wait) {
  var timeoutId = null;
  return function () {
    var args = arguments;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function () {
      fn.apply(null, args);
    }, wait);
  };
}

function randomSuffix(length) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// STEP 1 ??? STEP 2
// ============================================================
function goToStep2() {
  document.getElementById('step1-error').classList.add('hidden');

  // Save current form as last resource
  var lastRes = saveCurrentResource();
  if (!lastRes) return; // error already shown by saveCurrentResource

  // Combine already-saved resources with the current one
  var allResources = state.resources.concat([lastRes]);

  // Store auth
  state.auth = null;
  if (state.authEnabled) {
    var loginRoute = document.getElementById('input-login-route').value.trim();
    var token = document.getElementById('input-token').value.trim();
    var protectedRoutes = [];
    var cb = document.getElementById('protect-route-cb');
    if (cb && cb.checked) protectedRoutes.push(cb.value);
    if (loginRoute && token) {
      state.auth = { login_route: loginRoute, token: token, protected_routes: protectedRoutes };
    }
  }

  // Persist the full list (including current) for step 2
  state.resources = allResources;

  buildStep2();
  showStep(2);
}

function showStep1Error(msg) {
  var el = document.getElementById('step1-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function goBackToStep1() {
  stopOutputPolling();
  document.getElementById('preview-panel').classList.remove('hidden');
  document.getElementById('output-panel').classList.add('hidden');
  // Restore last resource into the form
  if (state.resources.length > 0) {
    var last = state.resources[state.resources.length - 1];
    state.resources = state.resources.slice(0, -1);
    document.getElementById('input-resource').value = last.name;
    document.getElementById('input-route').value = last.route_path;
    document.getElementById('schema-json-input').value = JSON.stringify(last.schema, null, 2);
    document.getElementById('resource-form-label').textContent =
      'Resource ' + (state.resources.length + 1);
    renderResourceList();
  }
  showStep(1);
}

function showStep(n) {
  document.getElementById('step-1').classList.toggle('hidden', n !== 1);
  document.getElementById('step-2').classList.toggle('hidden', n !== 2);
  document.getElementById('step-pill-1').classList.toggle('active', n === 1);
  document.getElementById('step-pill-2').classList.toggle('active', n === 2);
}

// ============================================================
// STEP 2 ??? BUILD (one section per resource)
// ============================================================
function schemaFieldLabel(fieldName, fieldDef) {
  if (typeof fieldDef === 'string') return fieldName + ' (' + fieldDef + ')';
  if (typeof fieldDef === 'object' && fieldDef !== null) {
    if ('enum' in fieldDef) return fieldName + ' (enum: ' + fieldDef['enum'].join(', ') + ')';
    if ('format' in fieldDef && fieldDef['format'] === 'email') return fieldName + ' (email)';
  }
  return fieldName;
}

function exampleValueForField(fieldDef) {
  if (typeof fieldDef === 'string') {
    if (fieldDef === 'integer' || fieldDef === 'number') return 0;
    if (fieldDef === 'boolean') return false;
    return '';
  }
  if (typeof fieldDef === 'object' && fieldDef !== null) {
    if ('enum' in fieldDef && fieldDef['enum'].length > 0) return fieldDef['enum'][0];
    if ('format' in fieldDef && fieldDef['format'] === 'email') return 'user@example.com';
  }
  return '';
}

function buildStep2() {
  var container = document.getElementById('resource-sections');
  container.innerHTML = '';

  state.resources.forEach(function (res, idx) {
    var section = document.createElement('div');
    section.className = 'resource-section';
    section.style.marginBottom = '28px';

    // Heading
    var heading = document.createElement('div');
    heading.className = 'resource-section-heading';
    heading.innerHTML =
      '<span class="resource-card-name">' + escapeHtml(res.name) + '</span>' +
      '<span class="resource-card-meta" style="margin-left:8px;">' + escapeHtml(res.route_path) + '</span>';
    section.appendChild(heading);

    // Schema summary
    var summary = document.createElement('div');
    summary.className = 'step2-schema-summary';
    summary.innerHTML =
      '<strong style="color:var(--accent);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em">Schema</strong><br>' +
      Object.keys(res.schema).map(function (fn) {
        return schemaFieldLabel(fn, res.schema[fn]);
      }).join(' &nbsp;??&nbsp; ');
    section.appendChild(summary);

    // Records label row with AI button
    var recLabelRow = document.createElement('div');
    recLabelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;flex-wrap:wrap;gap:8px;';

    var recLabel = document.createElement('label');
    recLabel.className = 'field-label';
    recLabel.style.marginBottom = '0';
    recLabel.textContent = 'Records (JSON array)';
    recLabel.setAttribute('for', 'records-json-input-' + idx);
    recLabelRow.appendChild(recLabel);

    var aiRecBtn = document.createElement('button');
    aiRecBtn.type = 'button';
    aiRecBtn.className = 'btn-ghost btn-ai';
    aiRecBtn.id = 'ai-records-btn-' + idx;
    aiRecBtn.style.cssText = 'margin-top:0;font-size:.7rem;padding:5px 12px;';
    aiRecBtn.textContent = '\u2728 Generate with AI';
    (function(i, resource) {
      aiRecBtn.onclick = function() { generateRecordsWithAI(i, resource); };
    })(idx, res);
    recLabelRow.appendChild(aiRecBtn);
    section.appendChild(recLabelRow);

    var aiRecStatus = document.createElement('div');
    aiRecStatus.className = 'field-hint';
    aiRecStatus.id = 'ai-records-status-' + idx;
    aiRecStatus.style.marginBottom = '7px';
    section.appendChild(aiRecStatus);

    // Example record placeholder
    var exampleRecord = {};
    Object.keys(res.schema).forEach(function (fn) {
      exampleRecord[fn] = exampleValueForField(res.schema[fn]);
    });
    var placeholder = JSON.stringify([exampleRecord], null, 2);

    var ta = document.createElement('textarea');
    ta.id = 'records-json-input-' + idx;
    ta.className = 'code-textarea';
    ta.rows = 10;
    ta.placeholder = placeholder;
    section.appendChild(ta);

    container.appendChild(section);
  });
}

// ============================================================
// SUBMIT
// ============================================================
function submitCreate() {
  var errorEl = document.getElementById('step2-error');
  errorEl.classList.add('hidden');

  var resourcesPayload = [];
  for (var i = 0; i < state.resources.length; i++) {
    var recs = getRecordsForIndex(i);
    if (recs === null) return; // error shown inside getRecordsForIndex
    resourcesPayload.push({
      name: state.resources[i].name,
      route_path: state.resources[i].route_path,
      schema: state.resources[i].schema,
      records: recs
    });
  }

  var payload = {
    slug: state.namespaceDraft,
    resources: resourcesPayload
  };
  if (state.auth) payload.auth = state.auth;

  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Generating???';

  fetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (res) {
      btn.disabled = false;
      btn.textContent = 'Generate Mock API';
      if (!res.ok) {
        errorEl.textContent = res.data.error || 'Something went wrong.';
        errorEl.classList.remove('hidden');
        return;
      }
      state.namespace = res.data.namespace;
      state.endpointData = res.data;
      renderOutput(res.data);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Generate Mock API';
      errorEl.textContent = 'Network error: ' + err.message;
      errorEl.classList.remove('hidden');
    });
}

function showStep2Error(msg) {
  var el = document.getElementById('step2-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ============================================================
// OUTPUT RENDERING
// ============================================================
function schemaChipLabel(fieldName, fieldDef) {
  if (typeof fieldDef === 'string') return { name: fieldName, type: fieldDef };
  if (typeof fieldDef === 'object' && fieldDef !== null) {
    if ('enum' in fieldDef) return { name: fieldName, type: 'enum(' + fieldDef['enum'].join(',') + ')' };
    if ('format' in fieldDef && fieldDef['format'] === 'email') return { name: fieldName, type: 'email' };
  }
  return { name: fieldName, type: '?' };
}

function renderOutput(data) {
  // Script tag
  document.getElementById('output-script-tag').textContent = data.interceptor_tag;

  // Schema summary ??? use first resource's schema from state
  var schemaEl = document.getElementById('output-schema-summary');
  var schemaToRender = state.resources.length > 0 ? state.resources[0].schema : {};
  schemaEl.innerHTML = Object.keys(schemaToRender).map(function (fieldName) {
    var chip = schemaChipLabel(fieldName, schemaToRender[fieldName]);
    return '<span class="schema-chip">' + escapeHtml(chip.name) +
           '<span class="chip-type">' + escapeHtml(chip.type) + '</span></span>';
  }).join('');

  var tokenBlock = document.getElementById('output-token-block');
  var tokenValue = document.getElementById('output-token-value');
  if (state.endpointData && state.endpointData.token) {
    tokenValue.textContent = state.endpointData.token;
    tokenBlock.classList.remove('hidden');
  } else {
    tokenValue.textContent = '';
    tokenBlock.classList.add('hidden');
  }

  // Expiry
  document.getElementById('output-expiry').textContent = data.expires_at.replace('T', ' ').replace('Z', ' UTC');

  // Endpoints + curl commands
  var endpointsEl = document.getElementById('output-endpoints');
  endpointsEl.innerHTML = '';

  var primaryResource = data.resources && data.resources[0];
  if (!primaryResource) return;

  var baseUrl = window.location.origin;
  var endpoints = [
    { label: 'GET',    key: 'list',   url: baseUrl + '/' + data.namespace + '/' + primaryResource.name, method: 'GET' },
    { label: 'POST',   key: 'create', url: baseUrl + '/' + data.namespace + '/' + primaryResource.name, method: 'POST' },
    { label: 'PUT',    key: 'update', url: baseUrl + '/' + data.namespace + '/' + primaryResource.name + '/<id>', method: 'PUT' },
    { label: 'DELETE', key: 'delete', url: baseUrl + '/' + data.namespace + '/' + primaryResource.name + '/<id>', method: 'DELETE' }
  ];

  // Build example body from first resource schema
  var firstSchema = state.resources.length > 0 ? state.resources[0].schema : {};
  var firstRecord = {};
  Object.keys(firstSchema).forEach(function (fn) {
    firstRecord[fn] = exampleValueForField(firstSchema[fn]);
  });

  endpoints.forEach(function (ep) {
    var item = document.createElement('div');
    item.className = 'endpoint-item';

    // URL row
    var urlRow = document.createElement('div');
    urlRow.className = 'endpoint-row';

    var methodBadge = document.createElement('span');
    methodBadge.className = 'endpoint-method method-' + ep.method.toLowerCase();
    methodBadge.textContent = ep.method;

    var urlSpan = document.createElement('span');
    urlSpan.className = 'endpoint-url';
    urlSpan.id = 'ep-url-' + ep.key;
    urlSpan.textContent = ep.url;

    var copyUrl = document.createElement('button');
    copyUrl.className = 'btn-copy';
    copyUrl.textContent = 'Copy';
    copyUrl.onclick = function () { copyTextContent(ep.url, copyUrl); };

    urlRow.appendChild(methodBadge);
    urlRow.appendChild(urlSpan);
    urlRow.appendChild(copyUrl);
    item.appendChild(urlRow);

    // Curl row
    var curl = buildCurl(ep.method, ep.url, firstRecord, state.auth);
    var curlRow = document.createElement('div');
    curlRow.className = 'curl-row';

    var curlCode = document.createElement('code');
    curlCode.className = 'curl-code';
    curlCode.id = 'curl-' + ep.key;
    curlCode.textContent = curl;

    var copyCurl = document.createElement('button');
    copyCurl.className = 'btn-copy';
    copyCurl.textContent = 'Copy';
    copyCurl.onclick = function () { copyTextContent(curl, copyCurl); };

    curlRow.appendChild(curlCode);
    curlRow.appendChild(copyCurl);
    item.appendChild(curlRow);
    endpointsEl.appendChild(item);
  });

  // Build inline tester options
  buildTester(endpoints, data);

  // Build fetch snippets
  renderFetchSnippets(data, endpoints);

  // Show output panel
  document.getElementById('preview-panel').classList.add('hidden');
  var outputPanel = document.getElementById('output-panel');
  outputPanel.classList.remove('hidden');
  refreshOutputStatus();
  startOutputPolling();
  outputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startOutputPolling() {
  stopOutputPolling();
  state.outputPollIntervalId = setInterval(function () {
    refreshOutputStatus();
  }, 10000);
}

function stopOutputPolling() {
  if (state.outputPollIntervalId) {
    clearInterval(state.outputPollIntervalId);
    state.outputPollIntervalId = null;
  }
}

function refreshOutputStatus() {
  if (!state.namespace) return;
  fetchNamespaceHealth();
  fetchNamespaceLogs();
}

function fetchNamespaceHealth() {
  var baseUrl = window.location.origin;
  fetch(baseUrl + '/' + state.namespace + '/health')
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return;
      renderHealthData(res.data);
    })
    .catch(function () {});
}

function fetchNamespaceLogs() {
  var baseUrl = window.location.origin;
  fetch(baseUrl + '/' + state.namespace + '/logs')
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return;
      renderLogsTable(res.data);
    })
    .catch(function () {});
}

function renderHealthData(healthItems) {
  var endpointsEl = document.getElementById('output-endpoints');
  var endpointItems = endpointsEl.querySelectorAll('.endpoint-item');
  var healthByName = {};
  healthItems.forEach(function (item) {
    healthByName[item.name] = item;
  });

  endpointItems.forEach(function (item) {
    var urlSpan = item.querySelector('.endpoint-url');
    if (!urlSpan) return;

    var urlText = urlSpan.textContent;
    var parts = urlText.split('/');
    var resourceName = parts[parts.length - 1] === '<id>' ? parts[parts.length - 2] : parts[parts.length - 1];
    var health = healthByName[resourceName];

    var existingName = item.querySelector('.endpoint-resource-name');
    if (existingName) existingName.remove();
    var existingDot = item.querySelector('.health-dot');
    if (existingDot) existingDot.remove();
    var existingButton = item.querySelector('.btn-reset-records');
    if (existingButton) existingButton.remove();
    var existingStatus = item.querySelector('.endpoint-inline-status');
    if (existingStatus) existingStatus.remove();

    if (!health) return;

    var row = item.querySelector('.endpoint-row');
    var methodBadge = row.querySelector('.endpoint-method');

    var dot = document.createElement('span');
    dot.className = 'health-dot health-' + health.health;
    dot.textContent = '???';

    var name = document.createElement('span');
    name.className = 'endpoint-resource-name';
    name.textContent = health.name;

    var resetButton = document.createElement('button');
    resetButton.className = 'btn-reset-records';
    resetButton.textContent = 'Reset Records';
    resetButton.onclick = function () {
      resetResourceRecords(health.name, resetButton);
    };

    var statusText = document.createElement('span');
    statusText.className = 'endpoint-inline-status';
    statusText.textContent = health.last_status_code === null ? '' : 'Last status: ' + health.last_status_code;

    row.insertBefore(dot, methodBadge.nextSibling);
    row.insertBefore(name, dot.nextSibling);
    row.appendChild(resetButton);
    row.appendChild(statusText);
  });
}

function resetResourceRecords(resourceName, button) {
  var baseUrl = window.location.origin;
  var originalText = button.textContent;
  button.disabled = true;
  fetch(baseUrl + '/' + state.namespace + '/' + resourceName + '/records', {
    method: 'DELETE'
  })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (res) {
      button.disabled = false;
      button.textContent = res.ok ? 'Records reset.' : originalText;
      if (res.ok) {
        setTimeout(function () {
          button.textContent = originalText;
        }, 2000);
        refreshOutputStatus();
      }
    })
    .catch(function () {
      button.disabled = false;
      button.textContent = originalText;
    });
}

function renderLogsTable(logs) {
  var tableWrap = document.getElementById('output-logs-table');
  var emptyEl = document.getElementById('output-logs-empty');

  if (!logs.length) {
    tableWrap.innerHTML = '';
    emptyEl.classList.remove('hidden');
    emptyEl.textContent = 'No requests logged yet.';
    return;
  }

  emptyEl.classList.add('hidden');

  var header = '<table class="logs-table"><thead><tr><th>Method</th><th>Route</th><th>Status</th><th>Response Time</th><th>Time Ago</th></tr></thead><tbody>';
  var rows = logs.map(function (log) {
    var statusClass = log.status_code < 400 ? 'log-status-green' : 'log-status-red';
    return '<tr>' +
      '<td>' + escapeHtml(log.method) + '</td>' +
      '<td>' + escapeHtml(log.route) + '</td>' +
      '<td class="' + statusClass + '">' + escapeHtml(String(log.status_code)) + '</td>' +
      '<td>' + escapeHtml(String(log.response_time_ms)) + 'ms</td>' +
      '<td>' + escapeHtml(timeAgo(log.created_at)) + '</td>' +
      '</tr>';
  }).join('');
  tableWrap.innerHTML = header + rows + '</tbody></table>';
}

function timeAgo(createdAt) {
  var created = new Date(createdAt);
  if (isNaN(created.getTime())) return 'just now';
  var seconds = Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000));
  if (seconds < 60) return seconds + 's ago';
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  return days + 'd ago';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// FETCH SNIPPET
// ============================================================
function buildFetchSnippet(method, url, auth, schema) {
  var token = auth ? auth.token : null;

  if (method === 'GET') {
    var snippet = 'const res = await fetch("' + url + '"';
    if (token) {
      snippet += ', {\n  headers: { "Authorization": "Bearer ' + token + '" }\n}';
    }
    snippet += ');\nconst data = await res.json();';
    return snippet;
  }

  if (method === 'POST' || method === 'PUT') {
    var exampleBody = {};
    if (schema) {
      Object.keys(schema).forEach(function (fn) {
        exampleBody[fn] = exampleValueForField(schema[fn]);
      });
    }
    var bodyStr = JSON.stringify(exampleBody, null, 2)
      .split('\n')
      .map(function (line, i) { return i === 0 ? line : '  ' + line; })
      .join('\n');

    var headersBlock = '    "Content-Type": "application/json"';
    if (token) {
      headersBlock += ',\n    "Authorization": "Bearer ' + token + '"';
    }

    return 'const res = await fetch("' + url + '", {\n' +
      '  method: "' + method + '",\n' +
      '  headers: {\n' + headersBlock + '\n  },\n' +
      '  body: JSON.stringify(' + bodyStr + ')\n' +
      '});\nconst data = await res.json();';
  }

  if (method === 'DELETE') {
    var delSnippet = 'const res = await fetch("' + url + '", {\n  method: "DELETE"';
    if (token) {
      delSnippet += ',\n  headers: { "Authorization": "Bearer ' + token + '" }';
    }
    delSnippet += '\n});\nconst data = await res.json();';
    return delSnippet;
  }

  return '';
}

function renderFetchSnippets(data, endpoints) {
  var container = document.getElementById('output-fetch-snippets');
  container.innerHTML = '';

  var firstSchema = state.resources.length > 0 ? state.resources[0].schema : {};

  endpoints.forEach(function (ep) {
    var snippet = buildFetchSnippet(ep.method, ep.url, state.auth, firstSchema);

    var row = document.createElement('div');
    row.className = 'curl-row';

    var codeEl = document.createElement('code');
    codeEl.className = 'curl-code';
    codeEl.textContent = snippet;

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.textContent = 'Copy';
    (function (text, btn) {
      copyBtn.onclick = function () { copyTextContent(text, btn); };
    }(snippet, copyBtn));

    row.appendChild(codeEl);
    row.appendChild(copyBtn);
    container.appendChild(row);
  });
}

function buildCurl(method, url, firstRecord, auth) {
  var parts = ['curl -X ' + method];
  if (auth) parts.push('-H "Authorization: Bearer ' + auth.token + '"');
  parts.push('-H "Content-Type: application/json"');
  if ((method === 'POST' || method === 'PUT') && firstRecord && Object.keys(firstRecord).length > 0) {
    parts.push("--data '" + JSON.stringify(firstRecord) + "'");
  }
  parts.push('"' + url + '"');
  return parts.join(' \\\n  ');
}

// ============================================================
// INLINE TESTER
// ============================================================
function buildTester(endpoints, data) {
  var select = document.getElementById('tester-method-select');
  select.innerHTML = '';

  endpoints.forEach(function (ep) {
    var opt = document.createElement('option');
    opt.value = ep.method + '|' + ep.url;
    opt.textContent = ep.method + ' ' + ep.url;
    select.appendChild(opt);
  });

  onTesterMethodChange();

  // Build example body from first resource schema
  var bodyInput = document.getElementById('tester-body');
  var firstSchema = state.resources.length > 0 ? state.resources[0].schema : {};
  var exampleBody = {};
  Object.keys(firstSchema).forEach(function (fn) {
    exampleBody[fn] = exampleValueForField(firstSchema[fn]);
  });
  bodyInput.value = JSON.stringify(exampleBody, null, 2);

  // Show auth input if auth configured
  if (state.auth) {
    document.getElementById('tester-auth-wrap').classList.remove('hidden');
    document.getElementById('tester-auth-header').value = 'Bearer ' + state.auth.token;
  } else {
    document.getElementById('tester-auth-wrap').classList.add('hidden');
  }
}

function onTesterMethodChange() {
  var val = document.getElementById('tester-method-select').value;
  var method = val ? val.split('|')[0] : '';
  var needsBody = method === 'POST' || method === 'PUT';
  document.getElementById('tester-body-wrap').classList.toggle('hidden', !needsBody);
  document.getElementById('tester-response').classList.add('hidden');
}

function sendTestRequest() {
  var val = document.getElementById('tester-method-select').value;
  if (!val) return;

  var parts = val.split('|');
  var method = parts[0];
  var url = parts[1];

  var options = { method: method, headers: { 'Content-Type': 'application/json' } };

  var authHeader = document.getElementById('tester-auth-header').value.trim();
  if (authHeader) options.headers['Authorization'] = authHeader;

  if (method === 'POST' || method === 'PUT') {
    var body = document.getElementById('tester-body').value.trim();
    try {
      JSON.parse(body);
      options.body = body;
    } catch (e) {
      showTesterResponse(400, { error: 'Invalid JSON body: ' + e.message });
      return;
    }
  }

  fetch(url, options)
    .then(function (res) {
      var status = res.status;
      return res.json().then(function (data) { return { status: status, data: data }; });
    })
    .then(function (res) {
      showTesterResponse(res.status, res.data);
    })
    .catch(function (err) {
      showTesterResponse(0, { error: 'Network error: ' + err.message });
    });
}

function showTesterResponse(status, data) {
  var responseEl = document.getElementById('tester-response');
  var badgeEl = document.getElementById('tester-status-badge');
  var bodyEl = document.getElementById('tester-response-body');

  badgeEl.textContent = status || 'ERR';
  badgeEl.className = 'status-badge';
  if (status >= 200 && status < 300) badgeEl.classList.add('status-2xx');
  else if (status >= 400 && status < 500) badgeEl.classList.add('status-4xx');
  else badgeEl.classList.add('status-5xx');

  bodyEl.textContent = JSON.stringify(data, null, 2);
  responseEl.classList.remove('hidden');
}

// ============================================================
// COPY UTILITIES
// ============================================================
function copyText(elementId, btn) {
  var text = document.getElementById(elementId).textContent;
  copyTextContent(text, btn);
}

function copyTextContent(text, btn) {
  navigator.clipboard.writeText(text).then(function () {
    var original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1800);
  }).catch(function () {
    // Fallback
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1800);
  });
}

// ============================================================
// AI SCHEMA GENERATION (Groq)
// ============================================================
async function generateSchemaWithAI() {
  var prompt = document.getElementById('ai-schema-prompt').value.trim();
  var statusEl = document.getElementById('ai-schema-status');
  var btn = document.getElementById('ai-generate-btn');

  if (!prompt) {
    statusEl.textContent = 'Please describe your resource first.';
    statusEl.style.color = 'var(--red)';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Generating...';
  statusEl.textContent = 'Asking Groq AI...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    var res = await fetch('/api/generate-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    });
    var data = await res.json();

    if (!res.ok) {
      statusEl.textContent = 'Error: ' + (data.error || 'Unknown error');
      statusEl.style.color = 'var(--red)';
      return;
    }

    document.getElementById('schema-json-input').value = JSON.stringify(data.schema, null, 2);
    statusEl.textContent = 'Schema generated! Review and adjust if needed.';
    statusEl.style.color = 'var(--green)';

    // Trigger parse status update
    var parseStatusEl = document.getElementById('json-parse-status');
    try {
      JSON.parse(document.getElementById('schema-json-input').value);
      parseStatusEl.textContent = '';
    } catch (e) {
      parseStatusEl.textContent = 'Invalid JSON';
    }
  } catch (err) {
    statusEl.textContent = 'Network error: ' + err.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    btn.disabled = false;
    btn.textContent = '\u2728 Generate with AI';
  }
}

// Allow pressing Enter in the AI prompt field to trigger generation
document.addEventListener('DOMContentLoaded', function () {
  var promptInput = document.getElementById('ai-schema-prompt');
  if (promptInput) {
    promptInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') generateSchemaWithAI();
    });
  }
});

// ============================================================
// AI RECORDS GENERATION (Groq)
// ============================================================
async function generateRecordsWithAI(idx, resource) {
  var btn = document.getElementById('ai-records-btn-' + idx);
  var statusEl = document.getElementById('ai-records-status-' + idx);
  var ta = document.getElementById('records-json-input-' + idx);

  btn.disabled = true;
  btn.textContent = 'Generating...';
  statusEl.textContent = 'Asking Groq AI...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    var res = await fetch('/api/generate-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_name: resource.name,
        schema: resource.schema
      })
    });
    var data = await res.json();

    if (!res.ok) {
      statusEl.textContent = 'Error: ' + (data.error || 'Unknown error');
      statusEl.style.color = 'var(--red)';
      return;
    }

    ta.value = JSON.stringify(data.records, null, 2);
    statusEl.textContent = 'Records generated! Review and adjust if needed.';
    statusEl.style.color = 'var(--green)';
  } catch (err) {
    statusEl.textContent = 'Network error: ' + err.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    btn.disabled = false;
    btn.textContent = '\u2728 Generate with AI';
  }
}
