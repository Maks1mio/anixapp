package com.anixapp.tv;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.webkit.WebView;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Enumeration;
import java.util.Locale;
import org.json.JSONObject;

public class LanLoginServer {
    private static final int PORT_START = 38471;
    private static final int PORT_TRIES = 8;

    private final Context context;
    private final WebView webView;
    private Thread thread;
    private ServerSocket socket;
    private volatile boolean running;
    private volatile String url = "";
    private volatile String csrf = "";

    public LanLoginServer(Context context, WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = webView;
    }

    public synchronized String start() {
        stop();
        csrf = randomToken();
        int bound = -1;
        ServerSocket listen = null;
        Exception last = null;
        for (int i = 0; i < PORT_TRIES; i++) {
            int port = PORT_START + i;
            try {
                listen = new ServerSocket(port);
                listen.setReuseAddress(true);
                bound = port;
                break;
            } catch (Exception e) {
                last = e;
            }
        }
        if (listen == null || bound < 0) {
            url = "";
            return "";
        }
        socket = listen;
        running = true;
        String host = lanIPv4(context);
        url = host == null || host.isEmpty()
            ? "http://127.0.0.1:" + bound + "/"
            : "http://" + host + ":" + bound + "/";
        thread = new Thread(this::loop, "anix-lan-login");
        thread.setDaemon(true);
        thread.start();
        return url;
    }

    public synchronized void stop() {
        running = false;
        url = "";
        csrf = "";
        ServerSocket current = socket;
        socket = null;
        if (current != null) {
            try { current.close(); } catch (Exception ignored) {}
        }
        if (thread != null) {
            try { thread.join(400); } catch (Exception ignored) {}
            thread = null;
        }
    }

    public String getUrl() {
        return url;
    }

    private void loop() {
        while (running && socket != null && !socket.isClosed()) {
            try {
                socket.setSoTimeout(1000);
                Socket client = socket.accept();
                handle(client);
            } catch (SocketTimeoutException ignored) {
            } catch (Exception e) {
                if (!running) break;
            }
        }
    }

    private void handle(Socket client) {
        try {
            client.setSoTimeout(8000);
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            String request = reader.readLine();
            if (request == null) {
                client.close();
                return;
            }
            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int sep = line.indexOf(':');
                if (sep > 0 && line.substring(0, sep).trim().equalsIgnoreCase("Content-Length")) {
                    try { contentLength = Integer.parseInt(line.substring(sep + 1).trim()); } catch (Exception ignored) {}
                }
            }
            if (request.startsWith("GET ")) {
                write(client, 200, pageHtml(""));
            } else if (request.startsWith("POST /login")) {
                if (contentLength <= 0 || contentLength > 8192) {
                    write(client, 400, pageHtml("Некорректный запрос."));
                } else {
                    char[] buf = new char[contentLength];
                    int n = 0;
                    while (n < contentLength) {
                        int r = reader.read(buf, n, contentLength - n);
                        if (r < 0) break;
                        n += r;
                    }
                    handlePost(client, new String(buf, 0, n));
                }
            } else {
                write(client, 404, "Not found");
            }
        } catch (Exception ignored) {
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    private void handlePost(Socket client, String body) throws Exception {
        String token = form(body, "csrf");
        String login = form(body, "login").trim();
        String password = form(body, "password");
        if (!csrf.equals(token)) {
            write(client, 403, pageHtml("Сессия устарела. Обновите страницу."));
            return;
        }
        if (login.isEmpty() || password.isEmpty()) {
            write(client, 400, pageHtml("Заполните почту/никнейм и пароль."));
            return;
        }
        emit(login, password);
        write(client, 200, okHtml());
    }

    private void emit(String login, String password) {
        try {
            JSONObject json = new JSONObject();
            json.put("login", login);
            json.put("password", password);
            final String js = "window.dispatchEvent(new CustomEvent('anix:tv-lan-login',{detail:"
                + json.toString() + "}));";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) {
        }
    }

    private static String form(String body, String key) {
        String[] parts = body.split("&");
        for (String part : parts) {
            int i = part.indexOf('=');
            if (i <= 0) continue;
            if (!urlDecode(part.substring(0, i)).equals(key)) continue;
            return urlDecode(part.substring(i + 1));
        }
        return "";
    }

    private static String urlDecode(String raw) {
        try {
            return java.net.URLDecoder.decode(raw.replace("+", " "), "UTF-8");
        } catch (Exception e) {
            return raw;
        }
    }

    private static void write(Socket client, int code, String html) throws Exception {
        byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
        String header = "HTTP/1.1 " + code + (code == 200 ? " OK" : " ERR") + "\r\n"
            + "Content-Type: text/html; charset=utf-8\r\n"
            + "Cache-Control: no-store\r\n"
            + "Content-Length: " + bytes.length + "\r\n"
            + "Connection: close\r\n\r\n";
        OutputStream out = client.getOutputStream();
        out.write(header.getBytes(StandardCharsets.US_ASCII));
        out.write(bytes);
        out.flush();
    }

    private static String randomToken() {
        byte[] raw = new byte[16];
        new SecureRandom().nextBytes(raw);
        StringBuilder sb = new StringBuilder();
        for (byte b : raw) sb.append(String.format(Locale.US, "%02x", b));
        return sb.toString();
    }

    private static String lanIPv4(Context context) {
        String fromNet = activePhysicalIPv4(context);
        if (fromNet != null && !fromNet.isEmpty()) return fromNet;
        return scanLanIPv4();
    }

    private static String activePhysicalIPv4(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            String ethernet = null;
            String wifi = null;
            for (Network network : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null) continue;
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) continue;
                boolean eth = caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
                boolean wi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
                if (!eth && !wi) continue;
                String ip = ipv4From(cm.getLinkProperties(network));
                if (ip == null) continue;
                if (eth && ethernet == null) ethernet = ip;
                if (wi && wifi == null) wifi = ip;
            }
            if (ethernet != null) return ethernet;
            return wifi;
        } catch (Exception e) {
            return null;
        }
    }

    private static String ipv4From(LinkProperties props) {
        if (props == null) return null;
        for (LinkAddress link : props.getLinkAddresses()) {
            InetAddress addr = link.getAddress();
            if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;
            String host = addr.getHostAddress();
            if (host != null && isGoodLanIp(host)) return host;
        }
        return null;
    }

    private static String scanLanIPv4() {
        try {
            String best = null;
            int bestScore = -1;
            Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
            while (nics.hasMoreElements()) {
                NetworkInterface nic = nics.nextElement();
                if (!nic.isUp() || nic.isLoopback() || nic.isVirtual() || nic.isPointToPoint()) continue;
                if (isVirtualNic(nic)) continue;
                Enumeration<InetAddress> addrs = nic.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;
                    String host = addr.getHostAddress();
                    if (host == null || !isGoodLanIp(host)) continue;
                    int score = lanScore(nic, host);
                    if (score > bestScore) {
                        bestScore = score;
                        best = host;
                    }
                }
            }
            return best;
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isVirtualNic(NetworkInterface nic) {
        String n = (nic.getDisplayName() + " " + nic.getName()).toLowerCase(Locale.US);
        String[] skip = {
            "tun", "tap", "vpn", "dummy", "ipsec", "rmnet", "p2p", "awdl",
            "docker", "veth", "ccmni", "cscotun", "wg0", "tailscale", "zerotier"
        };
        for (String needle : skip) {
            if (n.contains(needle)) return true;
        }
        return false;
    }

    private static boolean isGoodLanIp(String host) {
        if (!isPrivateLan(host) || isSkippedIp(host)) return false;
        return true;
    }

    private static boolean isPrivateLan(String host) {
        return inCidr(host, "10.0.0.0/8")
            || inCidr(host, "172.16.0.0/12")
            || inCidr(host, "192.168.0.0/16");
    }

    private static boolean isSkippedIp(String host) {
        String[] cidrs = {
            "169.254.0.0/16",
            "192.168.56.0/24",
            "192.168.57.0/24",
            "192.168.59.0/24",
            "192.168.64.0/24",
            "192.168.99.0/24",
            "192.168.137.0/24",
            "172.17.0.0/16",
            "10.0.2.0/24",
            "100.64.0.0/10",
            "25.0.0.0/8",
            "26.0.0.0/8",
            "198.18.0.0/15"
        };
        for (String cidr : cidrs) {
            if (inCidr(host, cidr)) return true;
        }
        return false;
    }

    private static int lanScore(NetworkInterface nic, String host) {
        int score = 10;
        String n = (nic.getDisplayName() + " " + nic.getName()).toLowerCase(Locale.US);
        if (n.contains("eth") || n.contains("wlan") || n.contains("wifi")) score += 30;
        if (inCidr(host, "192.168.0.0/24") || inCidr(host, "192.168.1.0/24")) score += 25;
        else if (inCidr(host, "192.168.0.0/16")) score += 15;
        return score;
    }

    private static boolean inCidr(String ip, String cidr) {
        try {
            int slash = cidr.indexOf('/');
            long addr = ipv4ToLong(ip);
            long base = ipv4ToLong(cidr.substring(0, slash));
            int bits = Integer.parseInt(cidr.substring(slash + 1));
            long mask = bits == 0 ? 0 : (0xffffffffL << (32 - bits)) & 0xffffffffL;
            return (addr & mask) == (base & mask);
        } catch (Exception e) {
            return false;
        }
    }

    private static long ipv4ToLong(String ip) {
        String[] p = ip.split("\\.");
        return (Long.parseLong(p[0]) << 24)
            | (Long.parseLong(p[1]) << 16)
            | (Long.parseLong(p[2]) << 8)
            | Long.parseLong(p[3]);
    }

    private String pageHtml(String error) {
        String err = error.isEmpty() ? "" : "<p class=\"err\">" + escape(error) + "</p>";
        return "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"/>"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>"
            + "<title>Вход в AnixApp на ТВ</title><style>"
            + ":root{color-scheme:dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
            + "font-family:system-ui,sans-serif;background:#0d0d0d;color:#e8e8e8}"
            + "form{width:min(22rem,calc(100vw - 2rem));background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;"
            + "padding:1.4rem;display:grid;gap:.85rem}h1{margin:0;font-size:1.35rem}"
            + "p{margin:0;color:#9a9a9a;font-size:.92rem;line-height:1.4}"
            + "label{display:grid;gap:.35rem;font-size:.82rem;color:#bdbdbd}"
            + "input{height:2.7rem;border-radius:10px;border:1px solid #333;background:#121212;color:#fff;padding:0 .85rem;font-size:1rem}"
            + "button{height:2.85rem;border:0;border-radius:999px;background:#e35454;color:#fff;font-weight:700;font-size:1rem}"
            + ".err{background:#3a1515;color:#ffb4b4;padding:.75rem;border-radius:10px}"
            + "</style></head><body><form method=\"post\" action=\"/login\" autocomplete=\"on\">"
            + "<h1>AnixApp на ТВ</h1>"
            + "<p>Войдите — телевизор получит сессию сам. Телефон и ТВ должны быть в одной сети.</p>"
            + err
            + "<input type=\"hidden\" name=\"csrf\" value=\"" + csrf + "\"/>"
            + "<label>Почта или никнейм<input name=\"login\" required autocomplete=\"username\" inputmode=\"email\"/></label>"
            + "<label>Пароль<input name=\"password\" type=\"password\" required autocomplete=\"current-password\"/></label>"
            + "<button type=\"submit\">Войти на телевизор</button></form></body></html>";
    }

    private static String okHtml() {
        return "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"/>"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Готово</title>"
            + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
            + "background:#0d0d0d;color:#e8e8e8;font-family:system-ui,sans-serif}"
            + ".box{max-width:22rem;padding:1.4rem;background:#1a1a1a;border-radius:16px;text-align:center;line-height:1.45}"
            + "</style></head><body><div class=\"box\"><h1>Отправлено на ТВ</h1>"
            + "<p>Смотрите экран телевизора — вход завершится там.</p></div></body></html>";
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
