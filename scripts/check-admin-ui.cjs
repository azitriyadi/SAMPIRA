// Admin UI regression checks use fake DOM/API responses; no server or database writes.
const assert = require('node:assert/strict');
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML: '', innerText: '', value: '', style: {}, classList: {add() {}, remove() {}}});
    return nodes.get(id);
};
let boot;
const calls = [], dialogs = [], replies = [];
let failAssignment = false;
const pickups = [
    {id: 1, tracking_number: 'TEST-PENDING', status: 'pending', created_at: new Date().toISOString(), weight_kg: 2, donor_name: 'Demo', category_name: 'Organik'},
    {id: 2, tracking_number: 'TEST-ARRIVED', status: 'arrived', created_at: '2020-01-01', weight_kg: 2, donor_name: 'Demo', category_name: 'Organik', payout_method: 'cash', verified_at: 'now', final_weight_kg: 2, final_eco_reward: 0, final_processing_fee: 0},
    {id: 3, tracking_number: 'TEST-UNVERIFIED', status: 'arrived', created_at: '2020-01-01', weight_kg: 5, donor_name: 'Demo', category_name: 'Computers', payout_method: 'cash'}
];
globalThis.document = {
    getElementById: id => id === 'announcement-form' ? null : node(id),
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener: (name, callback) => { if (name === 'DOMContentLoaded') boot = callback; }
};
globalThis.window = {location: {href: ''}};
globalThis.localStorage = {getItem: () => JSON.stringify({id: 1, name: 'Demo', role: 'admin', token: 'test'}), removeItem() {}};
globalThis.Swal = {
    fire: async options => {
        dialogs.push(options);
        const result = replies.shift() || {isConfirmed: false};
        if (result.isConfirmed && options.preConfirm) result.value = options.preConfirm();
        return result;
    }, showValidationMessage() {}
};
globalThis.fetch = async (url, options = {}) => {
    calls.push({url, body: options.body && JSON.parse(options.body)});
    let data = {};
    if (url.includes('announcements')) data = [];
    else if (url.includes('users/collectors')) data = [{id: 7, name: 'Demo Collector', email: 'demo@example.test'}];
    else if (url.includes('list_pickups')) data = pickups;
    else if (url.includes('type=stats')) data = {total_weight: 9, total_pickups: 3, pending_verifications: 1, collectors_online: 1, total_reward_paid: 0, total_reward_pending: 0};
    else if (url.includes('verify_pickup')) data = {final_weight_kg: 2.5, final_eco_reward: 17500, final_processing_fee: 2500};
    else if (url.includes('process_payout')) data = {transaction_reference: 'TEST-REF'};
    const status = failAssignment && url.includes('assign_collector') ? 'error' : 'success';
    return {status: 200, json: async () => ({status, data, message: 'Simulated failure'})};
};
require('../assets/js/admin.js');
async function main() {
    await boot();
    assert(node('globalPickupsTableBody').innerHTML.includes('TEST-PENDING'));
    assert(node('payoutLedgerTableBody').innerHTML.includes('Cairkan Payout'), 'Zero tariff must count as verified');
    node('admin-search-input').value = 'test-pending';
    window.filterPickupsTable();
    assert(!node('globalPickupsTableBody').innerHTML.includes('TEST-ARRIVED'));
    node('admin-search-input').value = '';
    window.setFilterRange('today');
    assert(!node('globalPickupsTableBody').innerHTML.includes('TEST-ARRIVED'));
    window.setFilterRange('all');
    const before = calls.length;
    await window.approveAndAssign('TEST-PENDING');
    assert.equal(calls.length, before, 'Cancel must not send assignment');
    node('collector-select').value = '7';
    replies.push({isConfirmed: true});
    await window.approveAndAssign('TEST-PENDING');
    assert.deepEqual(calls.find(c => c.url.includes('assign_collector')).body, {tracking_number: 'TEST-PENDING', collector_id: '7'});
    failAssignment = true;
    replies.push({isConfirmed: true});
    await window.approveAndAssign('TEST-PENDING');
    assert.equal(dialogs.at(-1).title, 'Gagal');
    replies.push({isConfirmed: true});
    await window.processPayout(2);
    assert(!calls.some(c => c.url.includes('verify_pickup')), 'Verified zero tariff must not prompt another weighing');
    assert.deepEqual(calls.find(c => c.url.includes('process_payout')).body, {pickup_id: 2});
    node('final-weight-input').value = '2.5';
    node('verification-notes-input').value = 'Hub check';
    replies.push({isConfirmed: true}, {isConfirmed: false});
    const payoutCount = calls.filter(c => c.url.includes('process_payout')).length;
    await window.processPayout(3);
    assert.deepEqual(calls.find(c => c.url.includes('verify_pickup')).body, {pickup_id: 3, final_weight_kg: 2.5, verification_notes: 'Hub check'});
    assert.equal(calls.filter(c => c.url.includes('process_payout')).length, payoutCount, 'Cancel payout must stop after verification');
    console.log('PASS: admin rendering, search/date filters, assignment cancel/success/error, zero-tariff payout, and verification/cancel flow. All API responses were mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
