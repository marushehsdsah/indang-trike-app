import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  TextInput,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

export default function MessagingScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
          <Feather name="arrow-left" size={22} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerUserInfo}>
          <View style={styles.avatar}>
            <Feather name="user" size={18} color="#FFF" />
          </View>
          <View>
            <Text style={styles.headerName}>Jame Hart</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="call-outline" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Feather name="info" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chatArea}>
        <View style={styles.chatPlaceholder} />
      </View>

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachButton}>
          <Ionicons name="camera-outline" size={20} color="#FFF" />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor="#A9B0B8"
        />

        <TouchableOpacity style={styles.sendButton}>
          <MaterialCommunityIcons name="send" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 18 : 14,
    paddingBottom: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E7E9E7',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF3EE',
  },
  headerUserInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#095C37',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerName: {
    color: '#1E2A1A',
    fontSize: 17,
    fontWeight: '700',
  },
  headerStatus: {
    color: '#5E6D5E',
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#095C37',
  },
  chatArea: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: '#F5F7F5',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '72%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  driverBubble: {
    backgroundColor: '#3B414A',
    borderTopLeftRadius: 8,
    marginLeft: 8,
  },
  passengerBubble: {
    backgroundColor: '#1F79FF',
    borderTopRightRadius: 8,
    marginRight: 8,
  },
  messageText: {
    fontSize: 16,
    fontWeight: '500',
  },
  driverText: {
    color: '#FFF',
  },
  passengerText: {
    color: '#FFF',
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A313A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#095C37',
  },
  attachButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#095C37',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F4F1',
    borderRadius: 18,
    color: '#1E2A1A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#095C37',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
