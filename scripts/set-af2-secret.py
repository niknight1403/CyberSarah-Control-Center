import json, os, sys, urllib.request
from nacl import encoding, public

val = sys.argv[1]
pat = os.environ["GH_PAT"]

def api(url, data=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
                                 method=method or ("POST" if data else "GET"))
    req.add_header("Authorization", "token " + pat)
    req.add_header("Accept", "application/vnd.github+json")
    return json.load(urllib.request.urlopen(req))

key = api("https://api.github.com/repos/niknight1403/Agentforge2/actions/secrets/public-key")
pk = public.PublicKey(key["key"].encode(), encoding.Base64Encoder())
sealed = public.SealedBox(pk).encrypt(val.encode())
api("https://api.github.com/repos/niknight1403/Agentforge2/actions/secrets/REVENUE_OS_API_KEY",
    {"encrypted_value": encoding.Base64Encoder.encode(sealed).decode(), "key_id": key["key_id"]})
print("AF2-Secret REVENUE_OS_API_KEY gesetzt")
