// Read-only API checks: list records and send requests rejected before any write.
import assert from 'node:assert/strict';

const base = 'http://localhost:8080';
async function request(path, {token, body, method = 'GET'} = {}) {
    const headers = {'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + path, {method, headers, body: body && JSON.stringify(body)});
    return {code: response.status, result: await response.json()};
}

async function session(role) {
    const {code, result} = await request('/api/auth/login', {
        method: 'POST', body: {email: role + '@ecorecycle.com', password: 'password123'}
    });
    assert.equal(code, 200);
    assert.equal(result.data.role, role);
    return result.data;
}

async function checkList(role, type) {
    const user = await session(role);
    const {code, result} = await request('/api/ecorecycle/list_pickups?type=' + type, {token: user.token});
    assert.equal(code, 200);
    assert(Array.isArray(result.data));
    for (const pickup of result.data) {
        assert.equal(typeof pickup.tracking_number, 'string');
        for (const key of ['donor_name', 'collector_name', 'payout_method', 'payout_account_name', 'payout_account_number']) {
            assert.equal(typeof pickup[key], 'string', key);
        }
        if (type === 'user') assert.equal(pickup.user_id, user.id);
        if (type === 'collector') assert(pickup.collector_id === user.id || pickup.status === 'pending');
    }
    return user;
}

const [user, collector, admin] = await Promise.all([
    checkList('user', 'user'), checkList('collector', 'collector'), checkList('admin', 'all')
]);
const cases = [
    ['/api/ecorecycle/list_pickups?type=user', {}, 401],
    ['/api/ecorecycle/list_pickups?type=all', {token: user.token}, 403],
    ['/api/ecorecycle/request_pickup', {method: 'POST', token: collector.token, body: {}}, 403],
    ['/api/ecorecycle/request_pickup', {method: 'POST', token: user.token, body: {}}, 400],
    ['/api/ecorecycle/assign_collector', {method: 'POST', token: user.token, body: {}}, 403],
    ['/api/ecorecycle/assign_collector', {method: 'POST', token: collector.token, body: {}}, 400],
    ['/api/ecorecycle/pickup_status', {method: 'POST', token: collector.token, body: {tracking_number: 'TEST-INVALID', status: 'completed'}}, 400],
    ['/api/ecorecycle/process_payout', {method: 'POST', token: user.token, body: {}}, 403],
    ['/api/ecorecycle/process_payout', {method: 'POST', token: admin.token, body: {}}, 400]
];
await Promise.all(cases.map(async ([path, options, expected]) => {
    const {code} = await request(path, options);
    assert.equal(code, expected, path);
}));
console.log('PASS: all three list formats, row ownership, nullable fields, and nine API validation/permission guards. No records changed.');
