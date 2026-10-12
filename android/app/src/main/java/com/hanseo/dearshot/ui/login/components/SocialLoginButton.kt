package com.hanseo.dearshot.ui.login.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.start.SocialLoginProvider
import com.hanseo.dearshot.ui.theme.DearShotTheme

private val GoogleSignInFont = FontFamily(
    Font(R.font.google_sans_medium, FontWeight.Medium),
)

@Composable
internal fun SocialLoginButton(
    provider: SocialLoginProvider,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val isKakao = provider == SocialLoginProvider.KAKAO
    val background = if (isKakao) Color(0xFFFEE500) else Color(0xFFF2F2F2)
    val foreground = if (isKakao) Color.Black.copy(alpha = 0.85f) else Color(0xFF1F1F1F)
    val iconRes = if (isKakao) R.drawable.ic_kakao_login else R.drawable.ic_google_login
    val labelRes = if (isKakao) R.string.login_provider_kakao else R.string.login_provider_google

    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(if (isKakao) 6.dp else 12.dp),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = background,
            contentColor = foreground,
            disabledContainerColor = background,
            disabledContentColor = foreground.copy(alpha = 0.38f),
        ),
    ) {
        // Image keeps the official logo colors; Icon's default tint would recolor Google.
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )

        Spacer(modifier = Modifier.width(10.dp))

        Text(
            text = stringResource(labelRes),
            style = MaterialTheme.typography.labelLarge.copy(
                fontFamily = if (isKakao) FontFamily.Default else GoogleSignInFont,
                fontWeight = if (isKakao) FontWeight.Normal else FontWeight.Medium,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                letterSpacing = 0.sp,
            ),
        )
    }
}

@Preview(name = "한국어", locale = "ko", showBackground = true, widthDp = 360, heightDp = 300)
@Preview(name = "English", locale = "en", showBackground = true, widthDp = 360, heightDp = 300)
@Composable
private fun SocialLoginButtonPreview() {
    DearShotTheme {
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            for (enabled in listOf(true, false)) {
                for (provider in SocialLoginProvider.entries) {
                    SocialLoginButton(
                        provider = provider,
                        onClick = {},
                        enabled = enabled,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
