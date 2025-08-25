from rest_framework.permissions import BasePermission


class IsOwnerOrReadOnly(BasePermission):
    """
    Permission permettant uniquement au propriétaire d'un objet de le modifier.
    
    Métier : Un pisciculteur ne peut modifier que son propre profil.
    Sécurité : Empêche les modifications croisées de profils.
    """
    def has_object_permission(self, request, view, obj):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        return obj == request.user


class IsMavecamAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.is_staff
        )