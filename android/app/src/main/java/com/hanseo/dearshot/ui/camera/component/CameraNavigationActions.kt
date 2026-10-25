package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R

// 촬영 조작부를 구현하기 전까지 사용하는 화면 이동 버튼.
@Composable
fun CameraNavigationActions(
    onOpenTemplates: () -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TextButton(onClick = onOpenTemplates) {
            Text(stringResource(R.string.open_templates))
        }
        TextButton(onClick = onOpenLogin) {
            Text(stringResource(R.string.open_login))
        }
    }
}
