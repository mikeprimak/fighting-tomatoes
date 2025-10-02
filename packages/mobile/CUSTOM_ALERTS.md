# Custom Alerts Guide

## Overview

All native `Alert.alert` calls have been replaced with custom styled modals that match the app's design.

## Quick Start

### 1. Import the hook
```tsx
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
```

### 2. Use the hook in your component
```tsx
export default function MyScreen() {
  const { alertState, showSuccess, showError, showInfo, showConfirm, hideAlert } = useCustomAlert();

  // Your component code...

  return (
    <View>
      {/* Your UI */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </View>
  );
}
```

## Usage Examples

### Success Messages
```tsx
// Simple success (auto-dismisses after 1.5s)
showSuccess('Crew created successfully!');

// Success with title
showSuccess('Data saved!', 'Success');
```

### Error Messages
```tsx
// Simple error (auto-dismisses after 2.5s)
showError('Failed to save data');

// Error with title
showError('Network connection failed', 'Error');

// Error from API
onError: (error: any) => {
  showError(error.error || error.message || 'An error occurred', 'Error');
}
```

### Info Messages
```tsx
// Info message (auto-dismisses after 2s)
showInfo('This feature is coming soon', 'Coming Soon');
```

### Confirmation Dialogs
```tsx
// Simple confirmation
showConfirm(
  'Are you sure you want to delete this?',
  () => {
    // Handle confirm
    deleteItem();
  },
  'Delete Item'  // title
);

// With custom button text
showConfirm(
  'Are you sure you want to sign out?',
  async () => {
    await logout();
  },
  'Sign Out',        // title
  'Sign Out',        // confirm button text
  'Cancel',          // cancel button text
  true              // destructive (red text)
);
```

## Alert Types

| Type | Icon | Auto-Dismiss | Use Case |
|------|------|--------------|----------|
| `success` | ✓ Green checkmark | 1.5s | Successful operations |
| `error` | ✗ Red X | 2.5s | Errors and failures |
| `info` | ℹ Blue info | 2s | Informational messages |
| `warning` | ⚠ Orange triangle | 2s | Warnings |
| `confirm` | ? Question mark | No | User confirmations |

## Migration from Alert.alert

### Before
```tsx
Alert.alert('Success', 'Operation completed!');
Alert.alert('Error', error.message);
Alert.alert(
  'Confirm Delete',
  'Are you sure?',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteItem() }
  ]
);
```

### After
```tsx
showSuccess('Operation completed!', 'Success');
showError(error.message, 'Error');
showConfirm(
  'Are you sure?',
  () => deleteItem(),
  'Confirm Delete',
  'Delete',
  'Cancel',
  true  // destructive
);
```

## Best Practices

1. **Always add `<CustomAlert {...alertState} onDismiss={hideAlert} />` before your component's closing tag**

2. **Use appropriate alert types:**
   - `showSuccess()` - For successful operations (green checkmark)
   - `showError()` - For errors and failures (red X)
   - `showInfo()` - For informational messages (blue info)
   - `showConfirm()` - For user confirmations (requires user action)

3. **Keep messages concise:**
   - Title: 1-3 words
   - Message: 1-2 sentences max

4. **Use destructive style for dangerous actions:**
   ```tsx
   showConfirm('Delete permanently?', handleDelete, 'Delete', 'Delete', 'Cancel', true);
   ```

5. **Handle nested confirmations:**
   ```tsx
   showConfirm('Sign out?', async () => {
     try {
       await logout();
     } catch (error) {
       showConfirm('Force logout?', forceLogout, 'Error', 'Force Logout', 'Cancel', true);
     }
   }, 'Sign Out', 'Sign Out', 'Cancel', true);
   ```

## Files Already Migrated

✅ All files have been migrated (30 alerts across 7 files):
- `app/(auth)/register.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/profile.tsx`
- `app/crew/info/[id].tsx`
- `app/crew/[id].tsx`
- `components/PredictionModal.tsx`
- `components/RateFightModal.tsx`

## For Future Development

**DO NOT** use `Alert.alert` from React Native. Always use `useCustomAlert()` hook instead.

The custom alerts:
- ✅ Match the app's design
- ✅ Support dark/light themes
- ✅ Auto-dismiss for simple messages
- ✅ Require user action for confirmations
- ✅ Support destructive actions
- ✅ Are consistent across the entire app
