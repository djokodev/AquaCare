# coding: utf-8
"""
Custom permissions for chat module.
Enforce access control: users can only access their own conversation.
"""

from rest_framework import permissions


class IsConversationOwnerOrAdmin(permissions.BasePermission):
    """
    Permission class: User can only access their own conversation.
    Admins (is_staff=True) can access any conversation.

    Used on:
    - ConversationViewSet
    - Message-related endpoints

    Permission rules:
    - User: Can access only conversation where conversation.user == request.user
    - Admin: Can access any conversation
    """

    def has_object_permission(self, request, view, obj):
        """
        Check object-level permission.

        Args:
            request: HTTP request
            view: DRF view
            obj: Object being accessed (Conversation or Message)

        Returns:
            bool: True if permission granted, False otherwise
        """
        # Admin can access any conversation
        if request.user.is_staff:
            return True

        # Check if object is Conversation or Message
        if hasattr(obj, 'user'):
            # Object is Conversation
            return obj.user == request.user
        elif hasattr(obj, 'conversation'):
            # Object is Message
            return obj.conversation.user == request.user

        # Deny by default
        return False
