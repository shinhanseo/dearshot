package com.hanseo.dearshot.data.local.security

import java.security.GeneralSecurityException

class TokenKeyMissingException :
        GeneralSecurityException("Token encryption key is unavailable")