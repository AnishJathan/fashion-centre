package com.fashioncentre.auth;

public record VerifiedIdentity(String provider, String subject, String firstName, String email) {}