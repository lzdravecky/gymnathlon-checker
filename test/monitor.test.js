const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isAvailable
} = require('../monitor');


test('kurz s volnym miestom je dostupny', () => {

    const course = {
        status: 'Voľné miesta',
        statusClass: ''
    };

    assert.equal(
        isAvailable(course),
        true
    );
});


test('obsadeny kurz nie je dostupny', () => {

    const course = {
        status: 'Obsadené',
        statusClass: ''
    };

    assert.equal(
        isAvailable(course),
        false
    );
});