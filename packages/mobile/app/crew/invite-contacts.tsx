import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';

interface Contact {
  id: string;
  name: string;
  phoneNumbers?: {
    number?: string;
  }[];
}

export default function InviteContactsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { crewId, crewName, inviteCode } = useLocalSearchParams<{
    crewId: string;
    crewName: string;
    inviteCode: string;
  }>();

  const { alertState, showError, showSuccess, showInfo, showConfirm, hideAlert } = useCustomAlert();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    requestContactsPermission();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredContacts(contacts);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query)
      );
      setFilteredContacts(filtered);
    }
  }, [searchQuery, contacts]);

  const requestContactsPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
        await loadContacts();
      } else {
        setPermissionGranted(false);
        setLoading(false);
        showError(
          'Please grant contacts permission to invite friends from your contacts.',
          'Permission Required'
        );
      }
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter contacts that have phone numbers
      const contactsWithPhones = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.id,
          name: contact.name || 'Unknown',
          phoneNumbers: contact.phoneNumbers,
        }));

      setContacts(contactsWithPhones);
      setFilteredContacts(contactsWithPhones);
      setLoading(false);
    } catch (error) {
      console.error('Error loading contacts:', error);
      setLoading(false);
      showError('Failed to load contacts. Please try again.');
    }
  };

  const toggleContact = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const sendInvitations = async () => {
    if (selectedContacts.size === 0) {
      showInfo('Please select at least one contact to invite.', 'No Selection');
      return;
    }

    // Check if SMS is available
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      showError('SMS is not available on this device.', 'Error');
      return;
    }

    // Get phone numbers of selected contacts
    const selectedContactsList = contacts.filter(contact =>
      selectedContacts.has(contact.id)
    );

    const phoneNumbers = selectedContactsList
      .map(contact => contact.phoneNumbers?.[0]?.number)
      .filter(Boolean) as string[];

    if (phoneNumbers.length === 0) {
      showError('Selected contacts do not have phone numbers.', 'Error');
      return;
    }

    // Create invitation message
    const message = `Join my FightCrewApp crew "${crewName}"! Use invite code: ${inviteCode}`;

    try {
      // This will open the native SMS app with pre-filled message
      await SMS.sendSMSAsync(phoneNumbers, message);
      // User will be taken to SMS app - they can send or cancel there
      // When they come back, they can tap back button to return to crew chat
    } catch (error) {
      console.error('Error sending SMS:', error);
      showError('Failed to open SMS app. Please try again.', 'Error');
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const isSelected = selectedContacts.has(item.id);
    const phoneNumber = item.phoneNumbers?.[0]?.number || 'No phone number';

    return (
      <TouchableOpacity
        style={[styles.contactItem, { borderBottomColor: colors.border }]}
        onPress={() => toggleContact(item.id)}
      >
        <View style={styles.contactInfo}>
          <Text style={[styles.contactName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.contactPhone, { color: colors.textSecondary }]}>
            {phoneNumber}
          </Text>
        </View>
        <View
          style={[
            styles.checkbox,
            { borderColor: colors.border },
            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
        >
          {isSelected && <FontAwesome name="check" size={16} color="white" />}
        </View>
      </TouchableOpacity>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Invite from Contacts',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading contacts...
          </Text>
        </View>
      ) : !permissionGranted ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="address-book" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Contacts permission is required
          </Text>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
            <FontAwesome name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search contacts..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Selected Count */}
          {selectedContacts.size > 0 && (
            <View style={[styles.selectedBanner, { backgroundColor: colors.primary }]}>
              <Text style={styles.selectedText}>
                {selectedContacts.size} contact(s) selected
              </Text>
            </View>
          )}

          {/* Contacts List */}
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="user-times" size={64} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {searchQuery ? 'No contacts found' : 'No contacts available'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              renderItem={renderContact}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Send Button */}
          {selectedContacts.size > 0 && (
            <View style={[styles.sendButtonContainer, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary }]}
                onPress={sendInvitations}
              >
                <FontAwesome name="send" size={16} color="white" />
                <Text style={styles.sendButtonText}>
                  Send Invitations ({selectedContacts.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    },
    loadingText: {
      fontSize: 16,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    },
    emptyText: {
      fontSize: 16,
      textAlign: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
    },
    selectedBanner: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    selectedText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },
    listContainer: {
      paddingBottom: 100,
    },
    contactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 4,
    },
    contactPhone: {
      fontSize: 14,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 4,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: 'rgba(0,0,0,0.1)',
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 8,
      gap: 8,
    },
    sendButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
  });
