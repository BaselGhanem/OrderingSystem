from pathlib import Path
import re

changed = set()


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')
    changed.add(path)


def replace_once(path, old, new, label):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one {label}, found {count}')
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, label, flags=0):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: expected one {label}, found {count}')
    write(path, updated)


# Exact status resolution order used by audit.html.
app_resolver = """function getEffectiveOrderStatus(order = {}) {
    return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
}"""
regex_once(
    'js/app.js',
    r"function getEffectiveOrderStatus\(order = \{\}\) \{.*?\n\}",
    app_resolver,
    'getEffectiveOrderStatus',
    re.S,
)

workflow_raw = """function getRawPrimaryStatus(order = {}) {
    return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
}"""
regex_once(
    'js/workflow.js',
    r"function getRawPrimaryStatus\(order = \{\}\) \{.*?\n\}",
    workflow_raw,
    'getRawPrimaryStatus',
    re.S,
)

workflow_primary = """function getPrimaryStatus(order = {}) {
    return getRawPrimaryStatus(order);
}"""
regex_once(
    'js/workflow.js',
    r"function getPrimaryStatus\(order = \{\}\) \{.*?\n\}",
    workflow_primary,
    'getPrimaryStatus',
    re.S,
)

report_resolver = """        function getReportEffectiveStatus(order = {}) {
            return order.status || order.workflowStage || order.supervisorStatus ||
                order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
        }"""
regex_once(
    'reports.html',
    r"        function getReportEffectiveStatus\(order = \{\}\) \{.*?\n        \}",
    report_resolver,
    'getReportEffectiveStatus',
    re.S,
)
replace_once(
    'reports.html',
    "            const rawStatus = order.status || order.orderStatus || order.workflowStatus || '';\n            const status = getReportEffectiveStatus(order);",
    "            const rawStatus = getReportEffectiveStatus(order);\n            const status = rawStatus;",
    'normalized report status',
)

canonical_inline = """    function primaryStatus(order = {}) {
      return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || ``;
    }

    function getWorkflowFollowUp"""
for path in ['control.html', 'basel.html']:
    regex_once(
        path,
        r"    function primaryStatus\(order = \{\}\) \{.*?\n    \}\n\n    function getWorkflowFollowUp",
        canonical_inline,
        'primaryStatus',
        re.S,
    )

replace_once(
    'supervisor-assignment.html',
    "      const status=String(order.status||order.workflowStage||'').trim();",
    "      const status=String(order.status||order.workflowStage||order.supervisorStatus||order.marketManagerStatus||order.financeStatus||order.orderStaffStatus||'').trim();",
    'supervisor assignment status',
)

# Match the user-facing labels in audit.html.
label_replacements = {
    'js/app.js': [
        ("    deleted_by_orders_staff: 'محذوفة من فريق المعالجة',", "    deleted_by_orders_staff: 'محذوفة من قسم الطلبيات',"),
    ],
    'js/workflow.js': [
        ("    deleted_by_orders_staff: 'محذوفة من فريق المعالجة',", "    deleted_by_orders_staff: 'محذوفة من قسم الطلبيات',"),
    ],
    'reports.html': [
        ("            orders_staff_pending: 'جاهز لقسم الطلبيات',", "            orders_staff_pending: 'جاهز للمعالجة',"),
    ],
    'control.html': [
        ("      orders_staff_pending: `جاهز لقسم الطلبيات`,", "      orders_staff_pending: `جاهز للمعالجة`,"),
    ],
    'basel.html': [
        ("      orders_staff_pending: `جاهز لقسم الطلبيات`,", "      orders_staff_pending: `جاهز للمعالجة`,"),
    ],
}
for path, pairs in label_replacements.items():
    for old, new in pairs:
        replace_once(path, old, new, f'label {old}')


def add_status_label(path, block_name, anchor, line):
    text = read(path)
    block_start = text.find(block_name)
    block_end = text.find('};', block_start)
    if block_start < 0 or block_end < 0:
        raise SystemExit(f'{path}: status label block not found')
    if 'orders_staff_edited_returned_to_finance' in text[block_start:block_end]:
        return
    if anchor not in text:
        raise SystemExit(f'{path}: label anchor not found')
    write(path, text.replace(anchor, anchor + '\n' + line, 1))


add_status_label(
    'js/app.js',
    'const WORKFLOW_STATUS_LABELS',
    "    orders_staff_hidden: 'تمت الفوترة',",
    "    orders_staff_edited_returned_to_finance: 'تم تعديله وإرجاعه للمالية',",
)
add_status_label(
    'js/workflow.js',
    'const STATUS_LABELS',
    "    orders_staff_hidden: 'تمت الفوترة',",
    "    orders_staff_edited_returned_to_finance: 'تم تعديله وإرجاعه للمالية',",
)
add_status_label(
    'reports.html',
    'const REPORT_STATUS_LABELS',
    "            orders_staff_hidden: 'تمت الفوترة',",
    "            orders_staff_edited_returned_to_finance: 'تم تعديله وإرجاعه للمالية',",
)

# Force the live pages to reload revised shared modules.
for path in ['login.html', 'order.html', 'supervisor.html']:
    text = read(path)
    updated, count = re.subn(
        r"js/app\.js\?v=[^\"']+",
        'js/app.js?v=20260722_status_unified_v1',
        text,
    )
    if count < 1:
        raise SystemExit(f'{path}: app.js reference not found')
    write(path, updated)

for path in ['market_manager.html', 'finance_controller.html', 'orders_staff.html']:
    text = read(path)
    updated, count = re.subn(
        r"js/workflow\.js\?v=[^\"']+",
        'js/workflow.js?v=20260722_status_unified_v1',
        text,
    )
    if count < 1:
        raise SystemExit(f'{path}: workflow.js reference not found')
    write(path, updated)

# Validate resolver field order and ensure no secondary evidence determines display status.
canonical_fields = [
    'order.status',
    'order.workflowStage',
    'order.supervisorStatus',
    'order.marketManagerStatus',
    'order.financeStatus',
    'order.orderStaffStatus',
]
checks = {
    'js/app.js': r"function getEffectiveOrderStatus\(order = \{\}\) \{(.*?)\n\}",
    'js/workflow.js': r"function getRawPrimaryStatus\(order = \{\}\) \{(.*?)\n\}",
    'reports.html': r"function getReportEffectiveStatus\(order = \{\}\) \{(.*?)\n\s*\}",
    'control.html': r"function primaryStatus\(order = \{\}\) \{(.*?)\n\s*\}",
    'basel.html': r"function primaryStatus\(order = \{\}\) \{(.*?)\n\s*\}",
}
for path, pattern in checks.items():
    text = read(path)
    match = re.search(pattern, text, re.S)
    if not match:
        raise SystemExit(f'{path}: canonical resolver not found after patch')
    body = match.group(1)
    positions = [body.find(field) for field in canonical_fields]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        raise SystemExit(f'{path}: canonical resolver order is incorrect')
    forbidden = ['exportedAt', 'hiddenByOrderStaff', 'isInvoiced', 'auditTrail', 'latestStatusFromLogs']
    if any(term in body for term in forbidden):
        raise SystemExit(f'{path}: resolver still infers status from secondary evidence')

print('Changed files:')
for path in sorted(changed):
    print(f' - {path}')
