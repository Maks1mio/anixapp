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

describe('isPrivateAddress: IPv6-обходы', () => {
  it('IPv4-mapped в hex-форме (так URL сериализует [::ffff:127.0.0.1])', () => {
    for (const ip of ['::ffff:7f00:1', '::ffff:a00:1', '::ffff:c0a8:1', '::ffff:a9fe:a9fe', '::ffff:127.0.0.1'])
      assert.equal(isPrivateAddress(ip), true, ip);
  });
  it('IPv4-compatible, NAT64, 6to4, Teredo с закрытыми адресами', () => {
    for (const ip of ['::7f00:1', '64:ff9b::7f00:1', '64:ff9b:1::1', '2002:7f00:1::1', '2001::1'])
      assert.equal(isPrivateAddress(ip), true, ip);
  });
  it('публичные IPv6 и вложенные публичные IPv4 разрешены', () => {
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1'])
      assert.equal(isPrivateAddress(ip), false, ip);
  });
  it('assertPublicHttpUrl блокирует [::ffff:127.0.0.1]', async () => {
    await assert.rejects(assertPublicHttpUrl('http://[::ffff:127.0.0.1]:17321/health'));
  });
});
