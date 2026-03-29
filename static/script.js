/* ============================================================
   MOCKDOCK — script.js
   Two-step form, schema builder, record seeder,
   output rendering, inline API tester
   ============================================================ */

// ---- State ----
var state = {
  schemaMode: 'form',     // 'form' | 'json'
  fields: [],             // [{ name, type }]
  authEnabled: false,
  namespace: null,
  resource: null,
  route: null,
  schema: null,
  records: [],
  auth: null,
  endpointData: null
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  addFieldRow();
});

// ============================================================
// STEP 1 — SCHEMA MODE TOGGLE
// ============================================================
function switchSchemaMode(mode) {
  state.schemaMode = mode;
  document.getElementById('schema-form-mode').classList.toggle('hidden', mode !== 'form');
  document.getElementById('schema-json-mode').classList.toggle('hidden', mode !== 'json');
  document.getElementById('toggle-form').classList.toggle('active', mode === 'form');
  document.getElementById('toggle-json').classList.toggle('active', mode === 'json');
}

// ============================================================
// STEP 1 — FIELD BUILDER
// ============================================================
function addFieldRow(name, type) {
  var container = document.getElementById('field-rows');
  var row = document.createElement('div');
  row.className = 'field-row';

  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'text-input';
  nameInput.placeholder = 'field name';
  nameInput.value = name || '';

  var typeSelect = document.createElement('select');
  typeSelect.className = 'select-input';
  ['string', 'number', 'boolean'].forEach(function (t) {
    var opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === (type || 'string')) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  var removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove';
  removeBtn.innerHTML = '×';
  removeBtn.onclick = function () { container.removeChild(row); };

  row.appendChild(nameInput);
  row.appendChild(typeSelect);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function getSchemaFromForm() {
  var schema = {};
  var rows = document.querySelectorAll('#field-rows .field-row');
  var error = null;
  rows.forEach(function (row) {
    var name = row.querySelector('input').value.trim();
    var type = row.querySelector('select').value;
    if (name) schema[name] = type;
  });
  if (Object.keys(schema).length === 0) error = 'Add at least one schema field.';
  return { schema: schema, error: error };
}

function getSchemaFromJSON() {
  var raw = document.getElementById('schema-json-input').value.trim();
  var status = document.getElementById('json-parse-status');
  if (!raw) {
    status.textContent = '';
    return { schema: null, error: 'Paste a JSON schema.' };
  }
  try {
    var parsed = JSON.parse(raw);
    var valid = ['string', 'number', 'boolean'];
    for (var key in parsed) {
      if (!valid.includes(parsed[key])) {
        status.textContent = '✗ Invalid type for "' + key + '". Use string, number, or boolean.';
        return { schema: null, error: status.textContent };
      }
    }
    if (Object.keys(parsed).length === 0) {
      status.textContent = '✗ Schema must have at least one field.';
      return { schema: null, error: status.textContent };
    }
    status.textContent = '✓ Valid';
    status.style.color = 'var(--green)';
    return { schema: parsed, error: null };
  } catch (e) {
    status.textContent = '✗ Invalid JSON: ' + e.message;
    status.style.color = 'var(--red)';
    return { schema: null, error: status.textContent };
  }
}

// ============================================================
// STEP 1 — AUTH TOGGLE
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

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('input-route').addEventListener('input', function () {
    if (state.authEnabled) updateProtectedRoutesList();
  });
});

// ============================================================
// STEP 1 → STEP 2
// ============================================================
function goToStep2() {
  var errorEl = document.getElementById('step1-error');
  errorEl.classList.add('hidden');

  var resource = document.getElementById('input-resource').value.trim();
  if (!resource) return showStep1Error('Resource name is required.');

  var route = document.getElementById('input-route').value.trim();
  if (!route) return showStep1Error('Route path is required.');
  if (!route.startsWith('/')) return showStep1Error('Route path must start with /');

  var schemaResult = state.schemaMode === 'form' ? getSchemaFromForm() : getSchemaFromJSON();
  if (schemaResult.error) return showStep1Error(schemaResult.error);

  // Save to state
  state.resource = resource;
  state.route = route;
  state.fields = Object.entries(schemaResult.schema).map(function (e) { return { name: e[0], type: e[1] }; });
  state.schema = schemaResult.schema;

  // Auth
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

  buildStep2();
  showStep(2);
}

function showStep1Error(msg) {
  var el = document.getElementById('step1-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function goBackToStep1() {
  showStep(1);
}

function showStep(n) {
  document.getElementById('step-1').classList.toggle('hidden', n !== 1);
  document.getElementById('step-2').classList.toggle('hidden', n !== 2);
  document.getElementById('step-pill-1').classList.toggle('active', n === 1);
  document.getElementById('step-pill-2').classList.toggle('active', n === 2);
}

// ============================================================
// STEP 2 — RECORD SEEDER
// ============================================================
function buildStep2() {
  // Schema summary
  var summary = document.getElementById('step2-schema-summary');
  summary.innerHTML = '<strong style="color:var(--accent);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em">Schema</strong><br>' +
    state.fields.map(function (f) { return f.name + ' <span style="color:var(--accent)">(' + f.type + ')</span>'; }).join(' &nbsp;·&nbsp; ');

  // Clear existing record rows
  document.getElementById('record-rows').innerHTML = '';

  // Add one default row
  addRecordRow();
}

function addRecordRow() {
  var container = document.getElementById('record-rows');
  var row = document.createElement('div');
  row.className = 'record-row';

  state.fields.forEach(function (field) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'record-field-input';
    input.placeholder = field.name + ' (' + field.type + ')';
    input.dataset.field = field.name;
    input.dataset.type = field.type;
    row.appendChild(input);
  });

  var removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove';
  removeBtn.innerHTML = '×';
  removeBtn.onclick = function () {
    if (container.children.length > 1) container.removeChild(row);
  };
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function collectRecords() {
  var rows = document.querySelectorAll('#record-rows .record-row');
  var records = [];
  var error = null;

  rows.forEach(function (row, rowIdx) {
    var inputs = row.querySelectorAll('.record-field-input');
    var record = {};
    inputs.forEach(function (input) {
      var name = input.dataset.field;
      var type = input.dataset.type;
      var raw = input.value.trim();

      if (type === 'number') {
        var n = Number(raw);
        if (raw === '' || isNaN(n)) {
          error = 'Row ' + (rowIdx + 1) + ': "' + name + '" must be a number.';
        } else {
          record[name] = n;
        }
      } else if (type === 'boolean') {
        if (raw !== 'true' && raw !== 'false') {
          error = 'Row ' + (rowIdx + 1) + ': "' + name + '" must be true or false.';
        } else {
          record[name] = raw === 'true';
        }
      } else {
        if (raw === '') {
          error = 'Row ' + (rowIdx + 1) + ': "' + name + '" cannot be empty.';
        } else {
          record[name] = raw;
        }
      }
    });
    if (!error) records.push(record);
  });

  return { records: records, error: error };
}

// ============================================================
// SUBMIT
// ============================================================
function submitCreate() {
  var errorEl = document.getElementById('step2-error');
  errorEl.classList.add('hidden');

  var result = collectRecords();
  if (result.error) {
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');
    return;
  }

  var payload = {
    resource: state.resource,
    route: state.route,
    schema: state.schema,
    records: result.records
  };
  if (state.auth) payload.auth = state.auth;

  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';

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

// ============================================================
// OUTPUT RENDERING
// ============================================================
function renderOutput(data) {
  // Script tag
  document.getElementById('output-script-tag').textContent = data.interceptor_tag;

  // Schema summary
  var schemaEl = document.getElementById('output-schema-summary');
  schemaEl.innerHTML = Object.entries(state.schema).map(function (e) {
    return '<span class="schema-chip">' + e[0] + '<span class="chip-type">' + e[1] + '</span></span>';
  }).join('');

  // Expiry
  document.getElementById('output-expiry').textContent = data.expires_at.replace('T', ' ').replace('Z', ' UTC');

  // Endpoints + curl commands
  var endpointsEl = document.getElementById('output-endpoints');
  endpointsEl.innerHTML = '';

  var endpoints = [
    { label: 'GET',    key: 'list',   url: data.endpoints.list.replace('GET    ', ''),   method: 'GET' },
    { label: 'POST',   key: 'create', url: data.endpoints.create.replace('POST   ', ''), method: 'POST' },
    { label: 'PUT',    key: 'update', url: data.endpoints.update.replace('PUT    ', ''), method: 'PUT' },
    { label: 'DELETE', key: 'delete', url: data.endpoints.delete.replace('DELETE ', ''), method: 'DELETE' }
  ];

  // Build example body from first record
  var firstRecord = state.endpointData && collectRecords().records[0];

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

  // Show output panel
  var outputPanel = document.getElementById('output-panel');
  outputPanel.classList.remove('hidden');
  outputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildCurl(method, url, firstRecord, auth) {
  var parts = ['curl -X ' + method];
  if (auth) parts.push('-H "Authorization: Bearer ' + auth.token + '"');
  parts.push('-H "Content-Type: application/json"');
  if ((method === 'POST' || method === 'PUT') && firstRecord) {
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

  // Pre-fill body with first record fields
  var bodyInput = document.getElementById('tester-body');
  var rec = collectRecords().records[0];
  bodyInput.value = rec ? JSON.stringify(rec, null, 2) : '{}';

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