#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah STRIPE PAYMENT MANAGER v1.0                             ║
║  Erstelle & verwalte Stripe Payment Links                          ║
║                                                                     ║
║  - Alle Payment Links anzeigen                                     ║
║  - Neue Links mit Success/Cancel-URLs                              ║
║  - Produkte aus Stripe LIVE abrufen                                ║
║  - Webhook testen                                                  ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 stripe-payment-manager.py
"""
import os, sys, json, time
from datetime import datetime

import stripe
from urllib.request import Request, urlopen
from urllib.error import URLError

STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
SERVER = "http://167.233.196.20:3000"
SUCCESS_URL = f"{SERVER}/thank_you.html"
CANCEL_URL = f"{SERVER}/cancel.html"

stripe.api_key = STRIPE_KEY

C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def show_banner():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  💳 CyberSarah STRIPE PAYMENT MANAGER v1.0      ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', 'Stripe LIVE')} — {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")

def list_products():
    print(f" {clr('bold', '📦 Stripe Produkte:')}\n")
    try:
        products = stripe.Product.list(limit=30, active=True)
        for i, p in enumerate(products.auto_paging_iter()):
            if i >= 20: break
            prices = stripe.Price.list(product=p.id, limit=1, active=True)
            price = prices.data[0].unit_amount / 100 if prices.data else 0
            print(f" {clr('g', str(i+1).rjust(2)+'.')} €{price:>6.2f} {p.name[:50]}")
            if i < 20:
                print(f"     {clr('b', p.id)}")
        return list(products.auto_paging_iter())[:20]
    except Exception as e:
        print(f" {clr('r', f'❌ Fehler: {e}')}")
        return []

def list_payment_links():
    print(f" {clr('bold', '🔗 Stripe Payment Links:')}\n")
    try:
        links = stripe.PaymentLink.list(limit=20, active=True)
        for i, l in enumerate(links.data):
            url = l.url
            active = clr('g', '✅') if l.active else clr('r', '❌')
            print(f" {active} {clr('b', url)}")
            if l.after_completion and l.after_completion.type == 'redirect':
                redirect = l.after_completion.redirect.url
                print(f"     Redirect: {clr('y', redirect)}")
        return links.data
    except Exception as e:
        print(f" {clr('r', f'❌ Fehler: {e}')}")
        return []

def create_payment_link():
    print(f"\n {clr('bold', '🆕 Neuen Payment Link erstellen:')}\n")
    print(f" Success-URL: {clr('g', SUCCESS_URL)}")
    print(f" Cancel-URL:  {clr('g', CANCEL_URL)}\n")
    
    # Get products
    try:
        products = list(stripe.Product.list(limit=50, active=True).auto_paging_iter())
        print(f"\n {clr('bold', 'Produkte:')}\n")
        for i, p in enumerate(products[:20]):
            prices = stripe.Price.list(product=p.id, limit=1, active=True)
            price = prices.data[0].unit_amount / 100 if prices.data else 0
            print(f" {clr('g', str(i+1).rjust(2)+'.')} €{price:>6.2f} {p.name[:50]}")
    except Exception as e:
        print(f" {clr('r', f'❌ {e}')}")
        return
    
    try:
        choice = int(input(f"\n {bold(clr('p', '➜'))} Produkt-Nummer: ")) - 1
        if choice < 0 or choice >= len(products):
            print(f" {clr('r', '❌ Ungültig')}")
            return
        p = list(products)[choice]
        prices = stripe.Price.list(product=p.id, limit=1, active=True)
        if not prices.data:
            print(f" {clr('r', '❌ Kein Preis für dieses Produkt')}")
            return
        price_id = prices.data[0].id
    except (ValueError, IndexError):
        print(f" {clr('r', '❌ Ungültig')}")
        return
    
    print(f"\n {clr('y', 'Erstelle Payment Link...')}")
    
    try:
        link = stripe.PaymentLink.create(
            line_items=[{'price': price_id, 'quantity': 1}],
            after_completion={
                'type': 'redirect',
                'redirect': {'url': SUCCESS_URL}
            },
            metadata={'source': 'stripe-payment-manager', 'product': p.name}
        )
        print(f"\n {clr('g', '✅ Payment Link erstellt!')}")
        print(f"   {clr('b', 'URL:')} {link.url}")
        print(f"   {clr('b', 'Produkt:')} {p.name}")
        print(f"   {clr('b', 'Success:')} {SUCCESS_URL}")
    except Exception as e:
        print(f" {clr('r', f'❌ Fehler: {e}')}")

def update_all_links():
    """Update all existing payment links with success/cancel URLs"""
    print(f"\n {clr('bold', '🔄 Aktualisiere ALLE Payment Links...')}\n")
    try:
        links = stripe.PaymentLink.list(limit=100, active=True)
        updated = 0
        for link in links.data:
            if not link.active:
                continue
            needs_update = False
            if not link.after_completion or link.after_completion.type != 'redirect':
                needs_update = True
            elif link.after_completion.redirect.url != SUCCESS_URL:
                needs_update = True
            
            if needs_update:
                stripe.PaymentLink.modify(
                    link.id,
                    after_completion={
                        'type': 'redirect',
                        'redirect': {'url': SUCCESS_URL}
                    }
                )
                updated += 1
                print(f"   {clr('g', '✅')} {link.url[:50]}... aktualisiert")
        
        print(f"\n {clr('g', f'✅ {updated} Links aktualisiert!')}")
    except Exception as e:
        print(f" {clr('r', f'❌ Fehler: {e}')}")

def show_balance():
    print(f"\n {clr('bold', '💰 Stripe Kontostand:')}\n")
    try:
        bal = stripe.Balance.retrieve()
        for b in bal.available:
            print(f"   Verfügbar: {b.amount/100:.2f} {b.currency.upper()}")
        for b in bal.pending:
            print(f"   Ausstehend: {b.amount/100:.2f} {b.currency.upper()}")
    except Exception as e:
        print(f" {clr('r', f'❌ {e}')}")

def test_webhook():
    print(f"\n {clr('bold', '🔌 Teste Stripe Webhook:')}\n")
    try:
        req = Request(f"{SERVER}/api/healthz", headers={'Accept': 'application/json'})
        with urlopen(req, timeout=5) as r:
            status = '✅' if r.status == 200 else '❌'
            print(f"   {status} Server: HTTP {r.status}")
        
        req2 = Request(f"{SERVER}/api/system-status", headers={'Accept': 'application/json'})
        with urlopen(req2, timeout=5) as r:
            data = json.loads(r.read())
            stripe_ok = data.get('stripeVerfuegbar', False)
            stripe_mode = 'LIVE 💰' if data.get('stripeLiveKey') else 'TEST'
            print(f"   {'✅' if stripe_ok else '❌'} Stripe: {stripe_mode}")
    except Exception as e:
        print(f"   ❌ Server nicht erreichbar: {e}")

def main():
    while True:
        show_banner()
        
        data = {'products': [], 'links': []}
        print(f"\n{clr('bold', '🎯 Aktionen:')}")
        print(f"  {clr('g', '1)')} Stripe-Kontostand")
        print(f"  {clr('g', '2)')} Produkte anzeigen")
        print(f"  {clr('g', '3)')} Payment Links anzeigen")
        print(f"  {clr('g', '4)')} Neuen Payment Link erstellen (mit Success-URL)")
        print(f"  {clr('g', '5)')} ALLE Links mit Success-URL aktualisieren")
        print(f"  {clr('g', '6)')} Webhook testen")
        print(f"  {clr('r', '0)')} Beenden")
        
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Auswahl: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if choice == '0': break
        elif choice == '1': show_balance()
        elif choice == '2': list_products()
        elif choice == '3': list_payment_links()
        elif choice == '4': create_payment_link()
        elif choice == '5': update_all_links()
        elif choice == '6': test_webhook()
        
        input(f"\n ⏎ Enter...")

if __name__ == "__main__":
    main()
