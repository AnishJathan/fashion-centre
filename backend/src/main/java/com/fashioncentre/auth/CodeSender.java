package com.fashioncentre.auth;

public interface CodeSender {
    void send(String phoneE164, String code);
}