package com.hanseo.dearshot.data.remote.auth

import com.hanseo.dearshot.data.remote.ApiFailure
import java.io.IOException

class RefreshFailedException(
    val failure: ApiFailure,
) : IOException("Token refresh failed")
