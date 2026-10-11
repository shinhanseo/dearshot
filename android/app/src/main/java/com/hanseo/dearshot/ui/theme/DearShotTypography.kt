package com.hanseo.dearshot.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.hanseo.dearshot.R

private val Pretendard = FontFamily(
    Font(R.font.pretendard_regular, FontWeight.Normal),
    Font(R.font.pretendard_semibold, FontWeight.SemiBold),
    Font(R.font.pretendard_bold, FontWeight.Bold),
)

private val DefaultTypography = Typography()

// Core sizes, line heights, and weights follow docs/design/dearshot-design-system.svg.
val DearShotTypography = Typography(
    displayLarge = DefaultTypography.displayLarge.copy(fontFamily = Pretendard),
    displayMedium = DefaultTypography.displayMedium.copy(fontFamily = Pretendard),
    displaySmall = DefaultTypography.displaySmall.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
        letterSpacing = 0.sp,
    ),
    headlineLarge = DefaultTypography.headlineLarge.copy(fontFamily = Pretendard),
    headlineMedium = DefaultTypography.headlineMedium.copy(fontFamily = Pretendard),
    headlineSmall = DefaultTypography.headlineSmall.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp,
    ),
    titleLarge = DefaultTypography.titleLarge.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp,
    ),
    titleMedium = DefaultTypography.titleMedium.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.sp,
    ),
    titleSmall = DefaultTypography.titleSmall.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
    ),
    bodyLarge = DefaultTypography.bodyLarge.copy(fontFamily = Pretendard),
    bodyMedium = DefaultTypography.bodyMedium.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.sp,
    ),
    bodySmall = DefaultTypography.bodySmall.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.sp,
    ),
    labelLarge = DefaultTypography.labelLarge.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.sp,
    ),
    labelMedium = DefaultTypography.labelMedium.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.SemiBold,
    ),
    labelSmall = DefaultTypography.labelSmall.copy(
        fontFamily = Pretendard,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.sp,
    ),
)
