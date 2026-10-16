import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * DB に入れる秘密の情報（LINE のチャネルシークレット・送信用アクセストークン、
 * Google の refreshToken・accessToken）を暗号化する／元に戻す。
 *
 * DB の中身が漏れても、鍵（環境変数 DATA_ENCRYPTION_KEY）が無ければ使えないようにするため。
 * 方式は AES-256-GCM（中身を隠し、書き換えられたら元に戻すときに気づける）。
 *
 * 保存する形は `v1:<乱数>:<検査用の印>:<暗号文>`（どれも base64url）。
 * 先頭の `v1` は「どの鍵で暗号化したか」の印。鍵を入れ替えるときは、
 *   1. KEYS に v2（例 DATA_ENCRYPTION_KEY_V2）を足して CURRENT_VERSION を 2 にする
 *   2. 移し替えスクリプト（npm run db:encrypt-secrets）で v1 の値を v2 でかけ直す
 *   3. v1 が残っていないのを確かめてから v1 の鍵を外す
 *
 * 暗号化を入れる前に保存された平文は、印が無いのでそのまま読む（段階移行）。
 * 書くときは必ず暗号化し、鍵が無ければ平文で保存せずに止める。
 */

const KEYS: Record<number, string> = {
  1: "DATA_ENCRYPTION_KEY",
};
const CURRENT_VERSION = 1;

const SEALED_PATTERN = /^v(\d+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]*)$/;
const IV_BYTES = 12;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

function loadKey(version: number): Buffer {
  const name = KEYS[version];
  if (!name) throw new SecretBoxError(`暗号化の版 v${version} に対応する鍵がありません`);
  const raw = process.env[name];
  if (!raw) {
    throw new SecretBoxError(
      `環境変数 ${name} が設定されていないため、秘密の情報を暗号化・復号できません`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new SecretBoxError(`環境変数 ${name} は32バイトの鍵を base64 にしたものにしてください`);
  }
  return key;
}

/** 暗号化済みの形か（平文で残っている古い値なら false） */
export function isSealed(stored: string): boolean {
  return SEALED_PATTERN.test(stored);
}

/** 今の鍵の版で暗号化されているか（移し替えスクリプトがかけ直す対象を選ぶのに使う） */
export function isSealedWithCurrentKey(stored: string): boolean {
  const match = SEALED_PATTERN.exec(stored);
  return match !== null && Number(match[1]) === CURRENT_VERSION;
}

/** 暗号化して、DB に入れる形にする */
export function sealSecret(plain: string): string {
  const key = loadKey(CURRENT_VERSION);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${CURRENT_VERSION}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/** DB の値を元に戻す。暗号化を入れる前の平文ならそのまま返す */
export function openSecret(stored: string): string {
  const match = SEALED_PATTERN.exec(stored);
  if (!match) return stored;

  const key = loadKey(Number(match[1]));
  const iv = Buffer.from(match[2], "base64url");
  const tag = Buffer.from(match[3], "base64url");
  const encrypted = Buffer.from(match[4], "base64url");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // 鍵が違う・値が書き換えられた・途中で切れた、のどれか
    throw new SecretBoxError("秘密の情報を復号できませんでした（鍵が違うか、値が壊れています）");
  }
}

/** 空（null・空文字）はそのまま null。それ以外は暗号化する */
export function sealSecretOrNull(plain: string | null | undefined): string | null {
  return plain ? sealSecret(plain) : null;
}

/** 空（null・空文字）はそのまま null。それ以外は元に戻す */
export function openSecretOrNull(stored: string | null | undefined): string | null {
  return stored ? openSecret(stored) : null;
}
