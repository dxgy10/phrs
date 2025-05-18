import os
import json
import time
import random
import asyncio
import requests
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
from colorama import init, Fore
from typing import List
from rich.console import Console
from rich.panel import Panel

init(autoreset=True)
console = Console()

# ======= KONSTANTA DEX & KONTRAK =======
EXPOLER = "https://testnet.pharosscan.xyz/tx/"
CHAIN_ID = 688688

WPHRS_ADDRESS = "0x76aaada469d23216be5f7c596fa25f282ff9b364"
USDC_ADDRESS = "0x4d21582f50Fb5D211fd69ABF065AD07E8738870D"
USDT_ADDRESS = "0x2eD344c586303C98FC3c6D5B42C5616ED42f9D9d"
SWAP_ROUTER_ADDRESS = "0x1a4de519154ae51200b0ad7c90f7fac75547888a"
STAKING_CONTRACT = "0x0000000000000000000000000000000000000000"

ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    }
]

USDC_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "spender", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

SWAP_ROUTER_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {"internalType": "address", "name": "tokenIn", "type": "address"},
                    {"internalType": "address", "name": "tokenOut", "type": "address"},
                    {"internalType": "uint24", "name": "fee", "type": "uint24"},
                    {"internalType": "address", "name": "recipient", "type": "address"},
                    {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
                    {"internalType": "uint256", "name": "amountOutMinimum", "type": "uint256"},
                    {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"},
                ],
                "internalType": "struct IV3SwapRouter.ExactInputSingleParams",
                "name": "params",
                "type": "tuple",
            },
        ],
        "name": "exactInputSingle",
        "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [
            {
                "components": [
                    {"internalType": "bytes", "name": "path", "type": "bytes"},
                    {"internalType": "address", "name": "recipient", "type": "address"},
                    {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
                    {"internalType": "uint256", "name": "amountOutMinimum", "type": "uint256"},
                ],
                "internalType": "struct IV3SwapRouter.ExactInputParams",
                "name": "params",
                "type": "tuple",
            },
        ],
        "name": "exactInput",
        "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes[]", "name": "data", "type": "bytes[]"}],
        "name": "multicall",
        "outputs": [{"internalType": "bytes[]", "name": "results", "type": "bytes[]"}],
        "stateMutability": "payable",
        "type": "function",
    },
]

# ======= FUNGSI RANDOM ALAMAT (untuk kirim token acak) =======
def alamat_acak():
    return "0x" + ''.join(random.choices("0123456789abcdef", k=40))

# ======= TAMPILAN AWAL =======
def tampil_banner():
    banner = """[bold cyan]
██╗  ██╗ █████╗ ███╗   ███╗ █████╗ 
██║  ██║██╔══██╗████╗ ████║██╔══██╗
███████║███████║██╔████╔██║███████║
██╔══██║██╔══██║██║╚██╔╝██║██╔══██║
██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
[/bold cyan]"""
    console.print(Panel.fit(banner, title="[bold yellow]Pharos Testnet[/bold yellow]", subtitle="D x G y"))


# ======= FUNGSI UTILITAS =======
def cetak(teks, tipe="info"):
    warna = {
        "info": Fore.BLUE,
        "sukses": Fore.GREEN,
        "gagal": Fore.RED,
        "peringatan": Fore.YELLOW,
        "khusus": Fore.MAGENTA,
    }
    print(warna.get(tipe, Fore.WHITE) + teks)

def acak_elemen(arr):
    return random.choice(arr)

def acak_angka(min_val, max_val, desimal=4):
    return round(random.uniform(min_val, max_val), desimal)

def tunggu_random(jeda: List[int]):
    t = random.randint(jeda[0], jeda[1])
    cetak(f"Tunggu {t} detik...", "info")
    time.sleep(t)

def muat_data(file):
    if not os.path.exists(file): return []
    with open(file, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]

def simpan_json(nama, data, file):
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            semua = json.load(f)
    else:
        semua = {}
    semua[nama] = data
    with open(file, 'w', encoding='utf-8') as f:
        json.dump(semua, f, indent=2)

# ======= KONFIGURASI =======
def muat_env(path=".env"):
    config = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.strip().split("=", 1)
            k, v = k.strip(), v.strip().strip('"')
            if v.lower() in ["true", "false"]:
                config[k] = v.lower() == "true"
            elif v.startswith("[") and v.endswith("]"):
                try:
                    config[k] = json.loads(v.replace("'", '"'))
                except:
                    config[k] = []
            elif v.isdigit():
                config[k] = int(v)
            else:
                config[k] = v
    return config

KONFIG = muat_env()
BASE_URL = KONFIG.get("BASE_URL")
RPC_URL = KONFIG.get("RPC_URL")
CHAIN_ID = KONFIG.get("CHAIN_ID")
DELAY = KONFIG.get("DELAY_BETWEEN_REQUESTS", [3, 10])
USE_PROXY = KONFIG.get("USE_PROXY", False)
REF_CODE = KONFIG.get("REF_CODE", "")

AMOUNT_SWAP = KONFIG.get("AMOUNT_SWAP", [0.001, 0.002])
AMOUNT_SEND = KONFIG.get("AMOUNT_SEND", [0.001, 0.002])
PERCENT_STAKE = KONFIG.get("PERCENT_STAKE", [5, 10])


# ======= HEADER DEFAULT =======
HEADER_DEFAULT = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json",
    "Origin": "https://testnet.pharosnetwork.xyz",
    "Referer": "https://testnet.pharosnetwork.xyz/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
}


# ======= KELAS UTAMA BOT =======
class PharosBot:
    def __init__(self, private_key: str):
        self.private_key = private_key
        self.account = Account.from_key(private_key)
        self.address = self.account.address
        self.web3 = Web3(Web3.HTTPProvider(RPC_URL))
        self.session = requests.Session()
        self.session.headers.update(HEADER_DEFAULT)
        self.token = None

        # Konversi alamat ke checksum sekali saja
        self.swap_router_address = self.web3.to_checksum_address(SWAP_ROUTER_ADDRESS)
        self.token_address = self.web3.to_checksum_address(WPHRS_ADDRESS)
        self.usdc_address = self.web3.to_checksum_address(USDC_ADDRESS)
        self.staking_address = self.web3.to_checksum_address(STAKING_CONTRACT)

    def log(self, pesan, tipe="info"):
        cetak(f"[{self.address[:8]}] {pesan}", tipe)

    def sign_message(self, pesan="pharos"):
        message = encode_defunct(text=pesan)
        signed = self.account.sign_message(message)
        return signed.signature.hex()

    def auth(self):
        tanda_tangan = self.sign_message()
        url = f"{BASE_URL}/user/login?address={self.address}&signature={tanda_tangan}&invite_code={REF_CODE}"
        res = self.session.post(url)

        try:
            data = res.json()
        except Exception:
            self.log(f"Gagal parsing JSON dari server: {res.text}", "gagal")
            return

        if res.ok and "data" in data and "jwt" in data["data"]:
            self.token = data["data"]["jwt"]
            self.session.headers.update({"authorization": f"Bearer {self.token}"})
            simpan_json(self.address, {"jwt": self.token}, "localStorage.json")
            self.log("Berhasil login", "sukses")
        else:
            self.log(f"Gagal login. Status: {res.status_code}, Pesan: {data}", "gagal")

    def get_profile(self):
        url = f"{BASE_URL}/user/profile?address={self.address}"
        res = self.session.get(url)
        if res.ok:
            data = res.json()
            points = data.get('data', {}).get('user_info', {}).get('TaskPoints', 0)
            self.log(f"Poin: {points}", "khusus")
        else:
            self.log("Gagal ambil profil", "peringatan")

    def checkin(self):
        url_status = f"{BASE_URL}/sign/status?address={self.address}"
        res = self.session.get(url_status)
        if res.ok and res.json().get("data", {}).get("status") == "1111222":
            url = f"{BASE_URL}/sign/in?address={self.address}"
            res_checkin = self.session.post(url)
            if res_checkin.ok:
                self.log("Checkin berhasil!", "sukses")
            else:
                self.log("Checkin gagal.", "peringatan")
        else:
            self.log("Sudah checkin hari ini.", "info")

    def faucet(self):
        url = f"{BASE_URL}/faucet/daily?address={self.address}"
        res = self.session.post(url)
        if res.ok:
            self.log("Faucet berhasil diambil!", "sukses")
        else:
            self.log("Gagal faucet.", "peringatan")

    def swap_token(self):
        jumlah = acak_angka(AMOUNT_SWAP[0], AMOUNT_SWAP[1])
        amount_in_wei = self.web3.to_wei(jumlah, 'ether')

        router = self.web3.eth.contract(
            address=self.swap_router_address,
            abi=SWAP_ROUTER_ABI
        )
        token = self.web3.eth.contract(
            address=self.token_address,
            abi=ERC20_ABI
        )

        # Ambil nonce sekali untuk dua transaksi
        nonce = self.web3.eth.get_transaction_count(self.address)

        # ===== APPROVE =====
        approve_tx = token.functions.approve(
            self.swap_router_address,
            amount_in_wei
        ).build_transaction({
            'from': self.address,
            'nonce': nonce,
            'gas': 60000,
            'gasPrice': self.web3.eth.gas_price,
            'chainId': CHAIN_ID
        })
        signed_approve = self.web3.eth.account.sign_transaction(approve_tx, self.private_key)
        self.web3.eth.send_raw_transaction(signed_approve.raw_transaction)
        self.log("✅ Approve token berhasil", "sukses")

        # Tambahkan sedikit delay agar approve diproses
        time.sleep(5)

        # ===== SWAP =====
        deadline = int(time.time()) + 300
        params = {
            "tokenIn": self.token_address,
            "tokenOut": self.usdc_address,
            "fee": 500,
            "recipient": self.address,
            "amountIn": amount_in_wei,
            "amountOutMinimum": 0,
            "sqrtPriceLimitX96": 0
        }

        tx = router.functions.exactInputSingle(params).build_transaction({
            'from': self.address,
            'nonce': nonce + 1,  # ⬅️ nonce berikutnya!
            'gas': 300000,
            'gasPrice': self.web3.eth.gas_price,
            'chainId': CHAIN_ID
        })
        signed_tx = self.web3.eth.account.sign_transaction(tx, self.private_key)
        tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        self.log(f"✅ Swap berhasil! TX: {EXPOLER}{tx_hash.hex()}", "sukses")

    def kirim_token(self):
        jumlah = acak_angka(AMOUNT_SEND[0], AMOUNT_SEND[1])
        amount_wei = self.web3.to_wei(jumlah, 'ether')
        tujuan = self.web3.to_checksum_address(alamat_acak())

        token = self.web3.eth.contract(address=self.token_address, abi=ERC20_ABI)

        tx = token.functions.transfer(tujuan, amount_wei).build_transaction({
            'from': self.address,
            'nonce': self.web3.eth.get_transaction_count(self.address),
            'gas': 100000,
            'gasPrice': self.web3.eth.gas_price,
            'chainId': CHAIN_ID
        })
        signed = self.web3.eth.account.sign_transaction(tx, self.private_key)
        tx_hash = self.web3.eth.send_raw_transaction(signed.raw_transaction)
        self.log(f"✅ Kirim token berhasil ke {tujuan}, TX: {EXPOLER}{tx_hash.hex()}", "sukses")

    def staking(self):
        persen = acak_angka(PERCENT_STAKE[0], PERCENT_STAKE[1])
        token = self.web3.eth.contract(address=self.token_address, abi=ERC20_ABI)
        staking = self.web3.eth.contract(address=self.staking_address)

        saldo = token.functions.balanceOf(self.address).call()
        jumlah_stake = int(saldo * persen / 100)

        approve_tx = token.functions.approve(self.staking_address, jumlah_stake).build_transaction({
            'from': self.address,
            'nonce': self.web3.eth.get_transaction_count(self.address),
            'gas': 60000,
            'gasPrice': self.web3.eth.gas_price,
            'chainId': CHAIN_ID
        })
        signed_approve = self.web3.eth.account.sign_transaction(approve_tx, self.private_key)
        self.web3.eth.send_raw_transaction(signed_approve.raw_transaction)
        self.log(f"✅ Approve staking {jumlah_stake} berhasil", "sukses")

        stake_tx = staking.functions.stake(jumlah_stake).build_transaction({
            'from': self.address,
            'nonce': self.web3.eth.get_transaction_count(self.address),
            'gas': 100000,
            'gasPrice': self.web3.eth.gas_price,
            'chainId': CHAIN_ID
        })
        signed_stake = self.web3.eth.account.sign_transaction(stake_tx, self.private_key)
        tx_hash = self.web3.eth.send_raw_transaction(signed_stake.raw_transaction)
        self.log(f"✅ Staking berhasil TX: {EXPOLER}{tx_hash.hex()}", "sukses")



    def jalankan_semua(self):
        self.auth()
        if not self.token:
            return
        tunggu_random(DELAY)
        self.get_profile()
        tunggu_random(DELAY)
        if KONFIG.get("AUTO_CHECKIN", True):
            self.checkin()
            time.sleep(5)
        tunggu_random(DELAY)
        if KONFIG.get("AUTO_FAUCET", True):
            self.faucet()
            time.sleep(5)
        tunggu_random(DELAY)
        if KONFIG.get("AUTO_SWAP", False):
            self.swap_token()
            time.sleep(5)
        tunggu_random(DELAY)
        if KONFIG.get("AUTO_SEND", False):
            self.kirim_token()
            time.sleep(5)
        tunggu_random(DELAY)
        if KONFIG.get("AUTO_STAKE", False):
            self.staking()


def main():
    tampil_banner()  
    print(Fore.YELLOW + "Bot Pharos dimulai...\n")
    private_keys = muat_data("privateKeys.txt")
    if not private_keys:
        cetak("File privateKeys.txt kosong atau tidak ditemukan!", "gagal")
        return

    for i, pk in enumerate(private_keys):
        cetak(f"\n🔄 Menjalankan akun {i + 1}...")
        bot = PharosBot(pk if pk.startswith("0x") else "0x" + pk)
        bot.jalankan_semua()
        tunggu_random(KONFIG.get("DELAY_START_BOT", [1, 5]))

    cetak("\n✅ Semua akun selesai diproses.\n", "sukses")
    if TIME_SLEEP := KONFIG.get("TIME_SLEEP"):
        cetak(f"Tidur selama {TIME_SLEEP} menit sebelum ulang...", "info")
        time.sleep(TIME_SLEEP * 60)

if __name__ == "__main__":
    main()
