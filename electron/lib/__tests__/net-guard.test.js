'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateAddress, assertPublicHttpUrl } = require('../net-guard');

describe('isPrivateAddress', () => {
  it('закрытые IPv4', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1'])
      assert.equal(isPrivateAddress(ip), true, ip);
  });
  it('публичные IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '151.101.1.69']) assert.equal(isPrivateAddress(ip), false, ip);
  });
  it('IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
    assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('отклоняет localhost, IP-литералы и не-http', async () => {
    for (const u of ['http://localhost/x', 'http://127.0.0.1:8080/', 'http://[::1]/', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'ftp://x/y', 'not a url'])
      await assert.rejects(() => assertPublicHttpUrl(u), u);
  });
  it('пропускает публичный IP-литерал', async () => {
    assert.equal(await assertPublicHttpUrl('https://1.1.1.1/a.png'), 'https://1.1.1.1/a.png');
  });
});
